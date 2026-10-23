import { afterEach, describe, expect, it, vi } from "vitest";
import { requestTechnicalHistory } from "./technical-history-client";
const selection = { range: "1Y" as const, from: null, to: null };
afterEach(() => vi.unstubAllGlobals());
describe("atomic Technical history transport", () => {
  it("shares requests and cancellation does not abort another consumer", async () => {
    let complete!: (value: Response) => void;
    const fetchMock = vi.fn(() => new Promise<Response>((resolve) => { complete = resolve; }));
    vi.stubGlobal("fetch", fetchMock);
    const first = new AbortController(); const second = new AbortController();
    const p1 = requestTechnicalHistory("SPY", "1D", selection, first.signal);
    const p2 = requestTechnicalHistory("SPY", "1D", selection, second.signal);
    first.abort();
    await expect(p1).rejects.toMatchObject({ name: "AbortError" });
    expect(fetchMock.mock.calls).toHaveLength(1);
    complete(new Response(JSON.stringify({ data: { symbol: "SPY", timeframe: "1D", bars: [{}] }, meta: {} })));
    expect((await p2).data.symbol).toBe("SPY");
  });
  it("rejects wrong-interval responses without cache poisoning or repeated retry", async () => {
    const mock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ data: { symbol: "NVDA", timeframe: "1D", bars: [{}] } })));
    vi.stubGlobal("fetch", mock);
    await expect(requestTechnicalHistory("NVDA", "4h", selection, new AbortController().signal)).rejects.toThrow("does not match");
    expect(mock).toHaveBeenCalledTimes(1);
  });
  it("aborts an obsolete request at the transport and rejects a late result", async () => {
    let signal!: AbortSignal; let complete!: (value: Response) => void;
    vi.stubGlobal("fetch", vi.fn((_url, options) => { signal = options.signal; return new Promise<Response>((resolve) => { complete = resolve; }); }));
    const controller = new AbortController();
    const promise = requestTechnicalHistory("MSFT", "1h", selection, controller.signal);
    controller.abort();
    await expect(promise).rejects.toMatchObject({ name: "AbortError" });
    expect(signal.aborted).toBe(true);
    complete(new Response(JSON.stringify({ data: { symbol: "MSFT", timeframe: "1h", bars: [{}] } })));
  });
});
