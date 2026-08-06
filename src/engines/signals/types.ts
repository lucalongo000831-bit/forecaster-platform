import type { FundamentalAnalysis } from "@/engines/fundamental";
import type { MarketRegimeAnalysis } from "@/engines/regime";
import type { SeasonalityAnalysis } from "@/engines/seasonality";
import type { TechnicalAnalysis } from "@/engines/technical";

export const SIGNAL_MODEL_VERSION = "multi-factor-signal-v1.0.0";

export type SignalHorizon = "intraday" | "1d" | "1w" | "1m" | "3m" | "6m" | "12m" | "long";
export type SignalCategory = "STRONG_SELL" | "SELL" | "HOLD" | "BUY" | "STRONG_BUY";
export type SignalComponentKey = "trend" | "momentum" | "volatility" | "volume" | "structure" | "relative" | "fundamental" | "seasonality" | "regime";

export interface SignalComponent {
  key: SignalComponentKey;
  label: string;
  score: number | null;
  configuredWeight: number;
  effectiveWeight: number;
  contribution: number | null;
  available: boolean;
  reason: string;
}

export interface SignalAnalysis {
  symbol: string;
  horizon: SignalHorizon;
  category: SignalCategory | null;
  score: number | null;
  confidence: number;
  completeness: number;
  calculatedAt: string;
  dataTimestamp: string;
  modelVersion: typeof SIGNAL_MODEL_VERSION;
  dataQuality: "INSUFFICIENT" | "LOW" | "MEDIUM" | "HIGH";
  components: SignalComponent[];
  regime: Omit<MarketRegimeAnalysis, "input">;
  reasons: string[];
  invalidations: string[];
  historicalHitRate: null;
  sampleSize: number;
  disclaimer: string;
  inputs: {
    technical: TechnicalAnalysis;
    fundamental: FundamentalAnalysis | null;
    seasonality: SeasonalityAnalysis | null;
  };
}

export interface SignalEngineInput {
  symbol: string;
  horizon: SignalHorizon;
  technical: TechnicalAnalysis;
  fundamental?: FundamentalAnalysis | null;
  seasonality?: SeasonalityAnalysis | null;
  regime: MarketRegimeAnalysis;
}
