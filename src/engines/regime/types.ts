import type { TechnicalAnalysis } from "@/engines/technical";

export const MARKET_REGIME_MODEL_VERSION = "market-regime-v1.0.0";

export type MarketRegimeType =
  | "BULL_LOW_VOL"
  | "BULL_HIGH_VOL"
  | "BEAR_LOW_VOL"
  | "BEAR_HIGH_VOL"
  | "RANGE_LOW_VOL"
  | "RANGE_HIGH_VOL";

export interface MarketRegimeAnalysis {
  benchmarkSymbol: string;
  calculatedAt: string;
  dataTimestamp: string;
  modelVersion: typeof MARKET_REGIME_MODEL_VERSION;
  regime: MarketRegimeType;
  direction: "BULL" | "BEAR" | "RANGE";
  volatility: "LOW" | "HIGH";
  riskAppetite: "RISK_ON" | "RISK_OFF" | "NEUTRAL";
  score: number;
  confidence: number;
  completeness: number;
  reasons: string[];
  invalidations: string[];
  input: TechnicalAnalysis;
}
