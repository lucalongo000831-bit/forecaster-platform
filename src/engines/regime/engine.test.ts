import { describe, expect, it } from "vitest";
import { analyzeMarketRegime } from "./engine";
import type { TechnicalAnalysis } from "@/engines/technical";

function technical(overrides: Partial<TechnicalAnalysis> = {}): TechnicalAnalysis {
  const indicator = { value: 90, period: 20, timestamp: "2026-08-05", observations: 20 };
  return {
    symbol: "^GSPC", timestamp: "2026-08-05", calculatedAt: "2026-08-06", modelVersion: "technical-v1.0.0", observations: 500, price: 100, score: 70, completeness: 95,
    trend: { sma: { "10": indicator, "20": indicator, "50": indicator, "100": indicator, "200": { ...indicator, value: 90, period: 200 } }, ema: { "9": indicator, "12": indicator, "21": indicator, "26": indicator, "50": indicator, "200": indicator }, sma20Slope: 2, sma50Slope: 2, distanceFromSma20: 4, distanceFromSma50: 6, distanceFromSma200: 11, cross: "NONE", score: 75 },
    momentum: { rsi14: indicator, macd: 1, macdSignal: 0.5, macdHistogram: 0.5, roc20: 4, stochasticK14: 65, stochasticD3: 60, momentum10: 3, score: 68 },
    volatility: { trueRange: 1, atr14: indicator, realized20: 1, annualized20: 16, bollingerUpper: 105, bollingerMiddle: 100, bollingerLower: 95, bollingerBandwidth: 10, priceZScore20: 1, maximumDrawdown: -10, score: 70 },
    volume: { average20: 100, average50: 100, relative20: 1, zScore20: 0, obv: 100, accumulationDistribution: 100, score: 60 },
    structure: { support20: 90, resistance20: 105, donchianUpper20: 105, donchianLower20: 90, breakout: false, breakdown: false, distanceFrom52WeekHigh: -2, distanceFrom52WeekLow: 20, swingHigh: 104, swingLow: 96, score: 70 },
    relativeStrength: { benchmarkSymbol: null, oneMonth: null, threeMonths: null, sixMonths: null, oneYear: null, score: null }, input: [], ...overrides,
  };
}

describe("market regime engine", () => {
  it("classifies a rising, calm benchmark as risk-on", () => {
    const result = analyzeMarketRegime(technical());
    expect(result.regime).toBe("BULL_LOW_VOL");
    expect(result.riskAppetite).toBe("RISK_ON");
  });

  it("classifies a weak volatile benchmark as risk-off", () => {
    const base = technical();
    const result = analyzeMarketRegime(technical({ price: 75, trend: { ...base.trend, score: 25 }, structure: { ...base.structure, score: 30 }, momentum: { ...base.momentum, score: 30 }, volatility: { ...base.volatility, annualized20: 42 } }));
    expect(result.regime).toBe("BEAR_HIGH_VOL");
    expect(result.riskAppetite).toBe("RISK_OFF");
  });
});
