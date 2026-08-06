import type { MarketRegimeAnalysis } from "@/engines/regime";
import type { SeasonalityAnalysis } from "@/engines/seasonality";
import type { TechnicalAnalysis } from "@/engines/technical";
import type { MarketChartPoint } from "@/types";

export const FORECAST_MODEL_VERSION = "probabilistic-forecast-v1.0.0";
export type ForecastHorizon = "1d" | "5d" | "10d" | "20d" | "1m" | "3m" | "6m" | "12m";

export interface ForecastPercentiles {
  p5: number;
  p10: number;
  p25: number;
  p50: number;
  p75: number;
  p90: number;
  p95: number;
}

export interface ForecastAnalysis {
  symbol: string;
  horizon: ForecastHorizon;
  horizonDays: number;
  currentPrice: number;
  currency: string;
  percentiles: ForecastPercentiles;
  distribution: Array<{ percentile: number; label: string; price: number }>;
  expectedReturn: number;
  expectedRange: { low: number; high: number };
  probabilityAboveCurrentPrice: number;
  probabilityBelowCurrentPrice: number;
  targetPrice: number | null;
  stopPrice: number | null;
  probabilityAboveTarget: number | null;
  probabilityBelowStop: number | null;
  confidence: number;
  sampleSize: number;
  simulations: number;
  modelError: number | null;
  backtestCoverage: { windows: number; coveragePercent: number };
  methods: string[];
  assumptions: string[];
  modelVersion: typeof FORECAST_MODEL_VERSION;
  dataTimestamp: string;
  generatedAt: string;
  disclaimer: string;
}

export interface ForecastEngineInput {
  symbol: string;
  horizon: ForecastHorizon;
  currency: string;
  bars: MarketChartPoint[];
  technical: TechnicalAnalysis;
  seasonality: SeasonalityAnalysis | null;
  regime: MarketRegimeAnalysis;
  targetPrice?: number | null;
  stopPrice?: number | null;
  simulations?: number;
}
