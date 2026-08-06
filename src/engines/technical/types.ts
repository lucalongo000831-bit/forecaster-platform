import type { MarketChartPoint } from "@/types";

export const TECHNICAL_MODEL_VERSION = "technical-v1.0.0";

export interface IndicatorValue {
  value: number | null;
  period: number;
  timestamp: string;
  observations: number;
}

export interface TechnicalAnalysis {
  symbol: string;
  timestamp: string;
  calculatedAt: string;
  modelVersion: typeof TECHNICAL_MODEL_VERSION;
  observations: number;
  price: number;
  score: number;
  completeness: number;
  trend: {
    sma: Record<"10" | "20" | "50" | "100" | "200", IndicatorValue>;
    ema: Record<"9" | "12" | "21" | "26" | "50" | "200", IndicatorValue>;
    sma20Slope: number | null;
    sma50Slope: number | null;
    distanceFromSma20: number | null;
    distanceFromSma50: number | null;
    distanceFromSma200: number | null;
    cross: "GOLDEN" | "DEATH" | "NONE" | "UNAVAILABLE";
    score: number;
  };
  momentum: {
    rsi14: IndicatorValue;
    macd: number | null;
    macdSignal: number | null;
    macdHistogram: number | null;
    roc20: number | null;
    stochasticK14: number | null;
    stochasticD3: number | null;
    momentum10: number | null;
    score: number;
  };
  volatility: {
    trueRange: number | null;
    atr14: IndicatorValue;
    realized20: number | null;
    annualized20: number | null;
    bollingerUpper: number | null;
    bollingerMiddle: number | null;
    bollingerLower: number | null;
    bollingerBandwidth: number | null;
    priceZScore20: number | null;
    maximumDrawdown: number | null;
    score: number;
  };
  volume: {
    average20: number | null;
    average50: number | null;
    relative20: number | null;
    zScore20: number | null;
    obv: number | null;
    accumulationDistribution: number | null;
    score: number;
  };
  structure: {
    support20: number | null;
    resistance20: number | null;
    donchianUpper20: number | null;
    donchianLower20: number | null;
    breakout: boolean;
    breakdown: boolean;
    distanceFrom52WeekHigh: number | null;
    distanceFrom52WeekLow: number | null;
    swingHigh: number | null;
    swingLow: number | null;
    score: number;
  };
  relativeStrength: {
    benchmarkSymbol: string | null;
    oneMonth: number | null;
    threeMonths: number | null;
    sixMonths: number | null;
    oneYear: number | null;
    score: number | null;
  };
  input: MarketChartPoint[];
}
