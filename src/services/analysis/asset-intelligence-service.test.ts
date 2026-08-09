import { describe, expect, it } from "vitest";
import type { MarketChartPoint } from "@/types";
import { calculateReturnCorrelation, classifyAssetIntelligenceKind } from "./asset-intelligence-service";

function series(multiplier: number): MarketChartPoint[] {
  return Array.from({ length: 40 }, (_, index) => { const close = 100 + index * multiplier + Math.sin(index) * multiplier; return { timestamp: new Date(Date.UTC(2025, 0, index + 1)).toISOString(), open: close - 1, high: close + 1, low: close - 2, close, volume: 1_000 + index }; });
}

describe("asset-specific intelligence", () => {
  it.each([["BTC-USD", "CRYPTOCURRENCY", "CRYPTO"], ["ETH-USD", "EQUITY", "CRYPTO"], ["SPY", "ETF", "ETF"], ["^GSPC", "EQUITY", "INDEX"]])("routes %s to %s intelligence", (symbol, quoteType, expected) => {
    expect(classifyAssetIntelligenceKind(symbol, quoteType)).toBe(expected);
  });

  it("does not route corporate equities away from Company Intelligence", () => {
    expect(classifyAssetIntelligenceKind("AAPL", "EQUITY")).toBeNull();
  });

  it("uses an explicit fund name when a provider misclassifies the quote type", () => {
    expect(classifyAssetIntelligenceKind("SPY", "EQUITY", "SPDR S&P 500 ETF Trust")).toBe("ETF");
  });

  it("calculates aligned daily-return correlation from real-shaped OHLC series", () => {
    expect(calculateReturnCorrelation(series(1), series(2))).toBeGreaterThan(0.99);
  });
});
