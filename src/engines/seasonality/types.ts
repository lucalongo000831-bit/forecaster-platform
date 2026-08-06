export const SEASONALITY_MODEL_VERSION = "seasonality-v1.0.0";
export type SeasonalityWindow = "1Y" | "5Y" | "10Y" | "15Y" | "20Y" | "MAX";
export type SeasonalityQuality = "INSUFFICIENT" | "LOW" | "MEDIUM" | "HIGH";

export interface SeasonalityBucket {
  key: number;
  label: string;
  mean: number | null;
  median: number | null;
  hitRate: number | null;
  standardDeviation: number | null;
  percentile10: number | null;
  percentile25: number | null;
  percentile50: number | null;
  percentile75: number | null;
  percentile90: number | null;
  best: number | null;
  worst: number | null;
  observations: number;
  confidenceLow: number | null;
  confidenceHigh: number | null;
  pValue: number | null;
  stability: number | null;
  quality: SeasonalityQuality;
}

export interface SeasonalityAnalysis {
  symbol: string;
  window: SeasonalityWindow;
  availableYears: number;
  observations: number;
  calculatedAt: string;
  dataTimestamp: string;
  modelVersion: typeof SEASONALITY_MODEL_VERSION;
  provider: string;
  quality: SeasonalityQuality;
  descriptiveOnly: boolean;
  monthly: SeasonalityBucket[];
  weekday: SeasonalityBucket[];
  weekOfYear: SeasonalityBucket[];
  dayOfMonth: SeasonalityBucket[];
  tradingProgress: SeasonalityBucket[];
  annualReturns: number[];
  currentYearMonthlyReturns: Record<number, number>;
  disclaimer: string;
}
