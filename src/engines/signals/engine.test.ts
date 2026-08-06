import { describe, expect, it } from "vitest";
import { analyzeSignal } from "./engine";
import { analyzeMarketRegime } from "@/engines/regime";
import type { TechnicalAnalysis } from "@/engines/technical";

function technical(score = 72, completeness = 95): TechnicalAnalysis {
  const indicator = { value: 100, period: 20, timestamp: "2026-08-05", observations: 20 };
  return { symbol: "AAPL", timestamp: "2026-08-05", calculatedAt: "2026-08-06", modelVersion: "technical-v1.0.0", observations: 500, price: 105, score, completeness,
    trend: { sma: { "10": indicator, "20": indicator, "50": indicator, "100": indicator, "200": indicator }, ema: { "9": indicator, "12": indicator, "21": indicator, "26": indicator, "50": indicator, "200": indicator }, sma20Slope: 2, sma50Slope: 1, distanceFromSma20: 5, distanceFromSma50: 5, distanceFromSma200: 5, cross: "NONE", score },
    momentum: { rsi14: indicator, macd: 1, macdSignal: 0, macdHistogram: 1, roc20: 3, stochasticK14: 65, stochasticD3: 60, momentum10: 2, score }, volatility: { trueRange: 1, atr14: indicator, realized20: 1, annualized20: 15, bollingerUpper: 110, bollingerMiddle: 100, bollingerLower: 90, bollingerBandwidth: 20, priceZScore20: 1, maximumDrawdown: -10, score }, volume: { average20: 100, average50: 100, relative20: 1.2, zScore20: 1, obv: 1, accumulationDistribution: 1, score }, structure: { support20: 95, resistance20: 110, donchianUpper20: 110, donchianLower20: 95, breakout: false, breakdown: false, distanceFrom52WeekHigh: -2, distanceFrom52WeekLow: 25, swingHigh: 108, swingLow: 98, score }, relativeStrength: { benchmarkSymbol: "^GSPC", oneMonth: 2, threeMonths: 3, sixMonths: 5, oneYear: 8, score }, input: [] };
}

describe("multi-factor signal engine", () => {
  it("emits a reproducible category when inputs are complete", () => {
    const asset = technical(75);
    const regime = analyzeMarketRegime(technical(72));
    const result = analyzeSignal({ symbol: "AAPL", horizon: "1m", technical: asset, regime });
    expect(result.category).toBe("BUY");
    expect(result.score).toBeGreaterThanOrEqual(60);
    expect(result.modelVersion).toBe("multi-factor-signal-v1.0.0");
    expect(result.historicalHitRate).toBeNull();
  });

  it("does not emit a signal when technical completeness is insufficient", () => {
    const asset = technical(50, 20);
    const result = analyzeSignal({ symbol: "AAPL", horizon: "1m", technical: asset, regime: analyzeMarketRegime(technical()) });
    expect(result.category).toBeNull();
    expect(result.dataQuality).toBe("INSUFFICIENT");
  });
});
