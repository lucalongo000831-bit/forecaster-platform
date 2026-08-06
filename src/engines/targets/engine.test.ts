import { describe, expect, it } from "vitest";
import { analyzeTargets } from "./engine";
import { analyzeMarketRegime } from "@/engines/regime";
import type { TechnicalAnalysis } from "@/engines/technical";

export function targetTechnical(): TechnicalAnalysis {
  const indicator = { value: 2, period: 14, timestamp: "2026-08-05", observations: 14 };
  return { symbol: "AAPL", timestamp: "2026-08-05", calculatedAt: "2026-08-06", modelVersion: "technical-v1.0.0", observations: 500, price: 100, score: 65, completeness: 90,
    trend: { sma: { "10": indicator, "20": indicator, "50": indicator, "100": indicator, "200": { ...indicator, value: 90 } }, ema: { "9": indicator, "12": indicator, "21": indicator, "26": indicator, "50": indicator, "200": indicator }, sma20Slope: 1, sma50Slope: 1, distanceFromSma20: 2, distanceFromSma50: 3, distanceFromSma200: 10, cross: "NONE", score: 65 }, momentum: { rsi14: indicator, macd: 1, macdSignal: 0, macdHistogram: 1, roc20: 2, stochasticK14: 60, stochasticD3: 55, momentum10: 1, score: 65 }, volatility: { trueRange: 2, atr14: indicator, realized20: 1, annualized20: 18, bollingerUpper: 110, bollingerMiddle: 100, bollingerLower: 90, bollingerBandwidth: 20, priceZScore20: 0, maximumDrawdown: -10, score: 60 }, volume: { average20: 1, average50: 1, relative20: 1, zScore20: 0, obv: 1, accumulationDistribution: 1, score: 55 }, structure: { support20: 92, resistance20: 108, donchianUpper20: 108, donchianLower20: 92, breakout: false, breakdown: false, distanceFrom52WeekHigh: -3, distanceFrom52WeekLow: 25, swingHigh: 107, swingLow: 93, score: 65 }, relativeStrength: { benchmarkSymbol: null, oneMonth: null, threeMonths: null, sixMonths: null, oneYear: null, score: null }, input: [] };
}

describe("target engine", () => {
  it("keeps target sources separate and builds a composite", () => {
    const technical = targetTechnical();
    const result = analyzeTargets({ symbol: "AAPL", horizon: "12m", currentPrice: 100, currency: "USD", instrumentType: "EQUITY", analyst: { symbol: "AAPL", targetLow: 90, targetHigh: 140, targetMedian: 118, targetConsensus: 120, analystCount: 20, currency: "USD", asOf: "2026-08-05" }, analystProvider: "fmp", technical, fundamental: null, regime: analyzeMarketRegime(technical) });
    expect(result.analystTarget.value).toBe(120);
    expect(result.technicalTarget.value).not.toBeNull();
    expect(result.compositeTarget).not.toBeNull();
    expect(result.dcf.applicable).toBe(false);
  });
});
