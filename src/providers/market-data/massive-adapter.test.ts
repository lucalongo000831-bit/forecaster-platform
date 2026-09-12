import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ massiveGet: vi.fn() }));

vi.mock("../massive/client", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../massive/client")>();
  return { ...actual, massiveGet: mocks.massiveGet };
});

import { MassiveMarketDataAdapter } from "./massive-adapter";
import { ProviderError } from "../errors";

const aggregateResponse = {
  status: "DELAYED",
  results: [
    { o: 630, h: 642, l: 628, c: 640, v: 900_000, t: Date.parse("2026-08-19T20:00:00.000Z") },
    { o: 641, h: 647, l: 639, c: 645.2, v: 1_000_000, t: Date.parse("2026-08-20T20:00:00.000Z") },
  ],
};

describe("Massive market-data asset semantics", () => {
  beforeEach(() => {
    mocks.massiveGet.mockReset();
    mocks.massiveGet.mockResolvedValue({
      results: [{
        last_trade: { price: 645.2, timestamp: Date.parse("2026-08-20T20:00:00.000Z") },
        last_quote: { bid_price: 645.1, ask_price: 645.3 },
        session: { previous_close: 640, open: 641, low: 639, high: 647, volume: 1_000_000 },
        market_status: "closed",
      }],
    });
  });

  it.each([
    ["NVDA", "EQUITY"],
    ["SPY", "ETF"],
    ["BTC-USD", "CRYPTOCURRENCY"],
  ])("maps %s to canonical quote type %s", async (symbol, expected) => {
    const result = await new MassiveMarketDataAdapter().getQuote(symbol);
    expect(result.data.quoteType).toBe(expected);
  });

  it("falls back to delayed aggregates and blocks repeated snapshot entitlement probes", async () => {
    const adapter = new MassiveMarketDataAdapter();
    mocks.massiveGet
      .mockRejectedValueOnce(new ProviderError("massive", "PLAN_RESTRICTED", "Snapshot not included.", false, 403))
      .mockResolvedValueOnce(aggregateResponse)
      .mockResolvedValueOnce(aggregateResponse);

    const startedAt = performance.now();
    const first = await adapter.getQuote("NVDA");
    const second = await adapter.getQuote("NVDA");

    expect(performance.now() - startedAt).toBeLessThan(500);
    expect(mocks.massiveGet).toHaveBeenCalledTimes(3);
    expect(mocks.massiveGet.mock.calls.map(([path]) => path)).toEqual([
      "/v3/snapshot",
      expect.stringContaining("/v2/aggs/ticker/NVDA/"),
      expect.stringContaining("/v2/aggs/ticker/NVDA/"),
    ]);
    expect(first.meta).toMatchObject({ provider: "massive", freshness: "delayed", freshnessType: "DELAYED", isFallback: false });
    expect(second.meta).toMatchObject({ provider: "massive", freshness: "delayed", freshnessType: "DELAYED", isFallback: false });
  });

  it("fails fast and blocks all Massive calls after an authentication failure", async () => {
    const adapter = new MassiveMarketDataAdapter();
    mocks.massiveGet.mockRejectedValueOnce(new ProviderError("massive", "UNAUTHORIZED", "Invalid credential.", false, 401));

    await expect(adapter.getQuote("AAPL")).rejects.toMatchObject({ code: "UNAUTHORIZED", status: 401 });
    await expect(adapter.getQuote("NVDA")).rejects.toMatchObject({ code: "UNAUTHORIZED", status: 401 });
    expect(mocks.massiveGet).toHaveBeenCalledTimes(1);
  });
});
