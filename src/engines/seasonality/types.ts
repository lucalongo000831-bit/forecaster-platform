export const SEASONALITY_MODEL_VERSION = "seasonality-v2.0.0";

export const SEASONALITY_HISTORICAL_WINDOWS = ["1Y", "3Y", "5Y", "7Y", "10Y", "15Y", "20Y", "25Y", "MAX"] as const;
export const SEASONALITY_WINDOWS = ["CURRENT", ...SEASONALITY_HISTORICAL_WINDOWS] as const;
export const PRESIDENTIAL_CYCLES = ["POST_ELECTION", "MIDTERM", "PRE_ELECTION", "ELECTION"] as const;

export type SeasonalityHistoricalWindow = typeof SEASONALITY_HISTORICAL_WINDOWS[number];
export type SeasonalityWindow = typeof SEASONALITY_WINDOWS[number];
export type SeasonalityQuality = "INSUFFICIENT" | "LOW" | "MEDIUM" | "HIGH";
export type SeasonalityAssetClass = "EQUITY" | "ETF" | "CRYPTO";
export type SeasonalitySide = "LONG" | "SHORT";
export type PresidentialCycle = typeof PRESIDENTIAL_CYCLES[number];
export type SeasonalitySeriesType = "CURRENT" | "HISTORICAL_WINDOW" | "PRESIDENTIAL_CYCLE" | "BEST_CORRELATED_YEAR";
export type SeasonalityAvailability = "AVAILABLE" | "INSUFFICIENT_HISTORY" | "INSUFFICIENT_SAMPLE" | "UNAVAILABLE";

export interface AdjustedSeasonalityBar {
  timestamp: string;
  date: string;
  year: number;
  month: number;
  day: number;
  weekday: number;
  open: number;
  high: number;
  low: number;
  close: number;
  adjustedOpen: number;
  adjustedHigh: number;
  adjustedLow: number;
  adjustedClose: number;
  adjustmentFactor: number;
  volume: number;
}

export interface SeasonalityCurvePoint {
  progress: number;
  value: number;
  label: string;
}

export interface SeasonalityCorrelation {
  rawCorrelation: number | null;
  correlationScore: number | null;
  sampleSize: number;
  quality: SeasonalityQuality;
  dataCompleteness: number;
  status: "AVAILABLE" | "INSUFFICIENT_SAMPLE" | "CURRENT_YEAR_UNAVAILABLE";
}

export interface SeasonalityCurve {
  id: string;
  label: string;
  type: SeasonalitySeriesType;
  available: boolean;
  status: SeasonalityAvailability;
  window?: SeasonalityHistoricalWindow;
  cycle?: PresidentialCycle;
  year?: number;
  sampleYears: number[];
  points: SeasonalityCurvePoint[];
  medianPoints: SeasonalityCurvePoint[];
  correlation: SeasonalityCorrelation | null;
  quality: SeasonalityQuality;
  dataCompleteness: number;
}

export interface SeasonalityBestCorrelatedYear {
  year: number | null;
  correlation: SeasonalityCorrelation;
  curve: SeasonalityCurve | null;
  note: string;
}

export interface SeasonalityPresidentialCycle {
  cycle: PresidentialCycle;
  label: string;
  sampleYears: number[];
  curve: SeasonalityCurve;
  quality: SeasonalityQuality;
}

export interface SeasonalityTradeObservation {
  year: number;
  openDate: string;
  closeDate: string;
  openPrice: number;
  closePrice: number;
  returnPct: number;
  maxDropPct: number;
  maxRisePct: number;
  maxFavorableExcursionPct: number;
  maxAdverseExcursionPct: number;
  openPriceSource: "ADJUSTED_OPEN" | "ADJUSTED_CLOSE_FALLBACK";
}

export interface SeasonalityRangeStats {
  seriesId: string;
  label: string;
  status: SeasonalityAvailability;
  probability: number | null;
  averageReturn: number | null;
  medianReturn: number | null;
  bestReturn: number | null;
  worstReturn: number | null;
  avgMaxRise: number | null;
  avgMaxDrop: number | null;
  observations: number;
  years: number[];
  quality: SeasonalityQuality;
  dataCompleteness: number;
  trades: SeasonalityTradeObservation[];
}

export interface SeasonalityTradeRange {
  rangeStart: string;
  rangeEnd: string;
  side: SeasonalitySide;
  crossesYear: boolean;
  statistics: SeasonalityRangeStats[];
}

export interface SeasonalityMonthlyCell {
  month: number;
  returnPct: number | null;
  status: "COMPLETE" | "IN_PROGRESS" | "MISSING";
}

export interface SeasonalityMonthlyRow {
  year: number;
  current: boolean;
  cells: SeasonalityMonthlyCell[];
}

export interface SeasonalityMonthlySummaryCell {
  month: number;
  probability: number | null;
  averageReturn: number | null;
  medianReturn: number | null;
  observations: number;
  years: number[];
  quality: SeasonalityQuality;
  dataCompleteness: number;
}

export interface SeasonalityMonthlyMatrix {
  rows: SeasonalityMonthlyRow[];
  summary: SeasonalityMonthlySummaryCell[];
  methodology: string;
}

export interface SeasonalityDirectionalBucket {
  key: number;
  label: string;
  score: number | null;
  positiveHitRate: number | null;
  sampleSize: number;
  years: number[];
  quality: SeasonalityQuality;
  dataCompleteness: number;
}

export interface SeasonalityDirectionalSeries {
  seriesId: string;
  label: string;
  status: SeasonalityAvailability;
  buckets: SeasonalityDirectionalBucket[];
}

export interface SeasonalityDirectionalAnalysis {
  selectedMonth: number;
  daily: SeasonalityDirectionalSeries[];
  weekly: SeasonalityDirectionalSeries[];
  monthly: SeasonalityDirectionalSeries[];
}

export interface SeasonalityAvailableHistory {
  firstDate: string;
  lastDate: string;
  currentYear: number;
  completedYears: number[];
  availableYears: number;
  observations: number;
}

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

export interface SeasonalityEngineOptions {
  assetClass?: SeasonalityAssetClass;
  windows?: SeasonalityHistoricalWindow[];
  selectedMonth?: number;
  rangeStart?: string;
  rangeEnd?: string;
  side?: SeasonalitySide;
  includeCycles?: boolean;
  includeCorrelations?: boolean;
  includeTradeStats?: boolean;
  includeTable?: boolean;
  now?: Date;
}

export interface SeasonalityV2Analysis {
  symbol: string;
  assetClass: SeasonalityAssetClass;
  window: SeasonalityHistoricalWindow;
  windows: SeasonalityHistoricalWindow[];
  availableYears: number;
  observations: number;
  calculatedAt: string;
  dataTimestamp: string;
  modelVersion: typeof SEASONALITY_MODEL_VERSION;
  provider: string;
  source: string;
  historyHash: string;
  configurationHash: string;
  quality: SeasonalityQuality;
  descriptiveOnly: boolean;
  availableHistory: SeasonalityAvailableHistory;
  curves: SeasonalityCurve[];
  correlations: Array<{ seriesId: string; label: string; correlation: SeasonalityCorrelation }>;
  bestCorrelatedYear: SeasonalityBestCorrelatedYear;
  presidentialCycles: SeasonalityPresidentialCycle[];
  tradeRange: SeasonalityTradeRange | null;
  monthlyMatrix: SeasonalityMonthlyMatrix | null;
  directional: SeasonalityDirectionalAnalysis;
  monthly: SeasonalityBucket[];
  weekday: SeasonalityBucket[];
  weekOfYear: SeasonalityBucket[];
  dayOfMonth: SeasonalityBucket[];
  tradingProgress: SeasonalityBucket[];
  annualReturns: number[];
  currentYearMonthlyReturns: Record<number, number>;
  disclaimer: string;
}

export type SeasonalityAnalysis = SeasonalityV2Analysis;
