import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ massiveGet: vi.fn() }));

vi.mock("../massive/client", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../massive/client")>();
  return { ...actual, massiveGet: mocks.massiveGet };
});

import { MassiveMarketDataAdapter } from "./massive-adapter";

describe("Massive market-data asset semantics", () => {
  beforeEach(() => {
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
});
