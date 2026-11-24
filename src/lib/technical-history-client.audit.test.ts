import { afterEach, describe, expect, it, vi } from "vitest";
import { requestTechnicalHistory, retainTechnicalDatasets } from "./technical-history-client";
import type { TechnicalChartResponse } from "@/types";
const bar = { timestamp: "2026-09-24T13:30:00.000Z", open: 10, high: 12, low: 9, close: 11, volume: 0 };
const selection = { range: "1Y" as const, from: null, to: null };
afterEach(() => { vi.unstubAllGlobals(); vi.useRealTimers(); });
describe("independent transport validation", () => {
  it("bounds retained custom-range arrays and keeps the latest use without mutating existing snapshots", () => {
    const value = { data: { symbol: "NVDA", bars: [bar] } } as TechnicalChartResponse;
    let saved: Record<string, TechnicalChartResponse> = {};
    for (let i = 0; i < 200; i++) saved = retainTechnicalDatasets(saved, `range-${i}`, value);
    expect(Object.keys(saved)).toHaveLength(32); expect(saved["range-0"]).toBeUndefined();
    const previous = saved; saved = retainTechnicalDatasets(saved, "range-168", value);
    expect(Object.keys(saved).at(-1)).toBe("range-168"); expect(Object.keys(previous).at(-1)).toBe("range-199");
  });
  it.each([
    [{}], [{ ...bar, high: 8 }], [{ ...bar, open: 0, low: 0 }], [{ ...bar, timestamp: "invalid" }],
    [{ ...bar, volume: -1 }], [{ ...bar, close: null }], [bar, bar],
    [bar, { ...bar, timestamp: "2026-09-23T13:30:00.000Z" }],
    [{ ...bar, timestamp: "2026-09-24T13:30:00.001Z" }, { ...bar, timestamp: "2026-09-24T13:30:00.002Z" }],
  ])("refuses invalid OHLCV without retry or poisoning the verified cache: %j", async (...bars) => {
    const fetch = vi.fn().mockResolvedValue(new Response(JSON.stringify({ data: { symbol: "NVDA", timeframe: "1D", bars } })));
    vi.stubGlobal("fetch", fetch);
    await expect(requestTechnicalHistory("NVDA", "1D", selection, new AbortController().signal, 571, true)).rejects.toThrow("Invalid verified history");
    expect(fetch).toHaveBeenCalledTimes(1);
  });
  it("refuses a valid series bound to the wrong historical selection", async () => {
    const fetch = vi.fn().mockResolvedValue(new Response(JSON.stringify({ data: { symbol: "NVDA", timeframe: "1D", requestedRange: "5Y", bars: [bar] } })));
    vi.stubGlobal("fetch", fetch);
    await expect(requestTechnicalHistory("NVDA", "1D", selection, new AbortController().signal, 574, true)).rejects.toThrow("historical range");
    expect(fetch).toHaveBeenCalledTimes(1);
  });
  it.each([429, 500])("retries %i only once, then returns a local error", async (status) => {
    vi.useFakeTimers();
    const fetch = vi.fn().mockImplementation(async () => new Response(JSON.stringify({ error: { message: "Controlled audit failure" } }), { status }));
    vi.stubGlobal("fetch", fetch);
    const result = expect(requestTechnicalHistory("NVDA", "1h", selection, new AbortController().signal, 572, true)).rejects.toThrow("Controlled audit failure");
    await vi.advanceTimersByTimeAsync(301); await result; expect(fetch).toHaveBeenCalledTimes(2);
  });
  it("bounds a hung provider transport to 35 seconds without retrying an aborted request", async () => {
    vi.useFakeTimers();
    const fetch = vi.fn((_url, options) => new Promise((_resolve, reject) => options.signal.addEventListener("abort", () => reject(options.signal.reason), { once: true })));
    vi.stubGlobal("fetch", fetch);
    const result = expect(requestTechnicalHistory("NVDA", "1h", selection, new AbortController().signal, 573, true)).rejects.toThrow("timed out");
    await vi.advanceTimersByTimeAsync(35_001); await result; expect(fetch).toHaveBeenCalledTimes(1);
  });
});
