import type { MarketChartPoint } from "@/types";

export const PATTERN_MODEL_VERSION = "pattern-v2.0.0" as const;
export const PATTERN_LOOKBACK_OBSERVATIONS = { "1M": 21, "3M": 63, "6M": 126 } as const;

export type PatternModelVersion = typeof PATTERN_MODEL_VERSION;
export type PatternLookback = keyof typeof PATTERN_LOOKBACK_OBSERVATIONS;
export type PatternAssetClass = "EQUITY" | "ETF" | "CRYPTO";
export type PatternDirection = "BULLISH" | "BEARISH" | "NEUTRAL";
export type PatternStrength = "STRONG" | "MODERATE" | "WEAK" | "INSUFFICIENT_DATA";
export type PatternStatus = "AVAILABLE" | "INSUFFICIENT_HISTORY" | "INSUFFICIENT_SAMPLE";

export interface PatternEngineOptions {
  referenceDate?: string;
  lookback?: PatternLookback;
  assetClass?: PatternAssetClass;
  topK?: number;
  minimumSimilarity?: number;
  minimumSample?: number;
  maximumOverlap?: number;
}

export interface PatternPathPoint {
  observation: number;
  date: string | null;
  value: number;
}

export interface PatternSimilarityComponents {
  correlation: number;
  shapeDistance: number;
  directionalAgreement: number;
  volatilitySimilarity: number;
  trendSimilarity: number;
}

export interface PatternMatchedEvent {
  id: string;
  rank: number;
  startDate: string;
  matchEndDate: string;
  outcomeEndDate: string;
  similarity: number;
  similarityComponents: PatternSimilarityComponents;
  direction: PatternDirection;
  performance: number;
  maxDrop: number;
  maxRise: number;
  neutralThreshold: number;
  normalizedFuturePath: PatternPathPoint[];
  observations: number;
}

export interface PatternAveragePath {
  semantic: "UNDERLYING_PATH_AFTER_BULLISH_CASES" | "UNDERLYING_PATH_AFTER_BEARISH_CASES";
  sampleSize: number;
  points: Array<PatternPathPoint & { median: number; lowerBand: number; upperBand: number }>;
}

export interface PatternProbability {
  bullish: number | null;
  bearish: number | null;
  neutral: number | null;
  sampleSize: number;
  denominator: "ALL_VALID_MATCHED_EVENTS";
}

export interface PatternRobustness {
  score: number;
  stars: 1 | 2 | 3 | 4 | 5 | null;
  components: {
    sampleAdequacy: number;
    medianSimilarity: number;
    outcomeConsistency: number;
    dispersion: number;
    temporalDiversity: number;
    subsampleStability: number;
  };
}

export interface PatternReference {
  requestedDate: string;
  resolvedDate: string | null;
  latestAvailableDate: string | null;
  previousValidDate: string | null;
  nextValidDate: string | null;
  lookbackStartDate: string | null;
  entryPrice: number | null;
  resolution: "EXACT" | "ON_OR_BEFORE" | "UNAVAILABLE";
}

export interface PatternQuality {
  status: PatternStatus;
  quality: "HIGH" | "MEDIUM" | "LOW" | "INSUFFICIENT";
  availableHistory: {
    startDate: string | null;
    endDate: string | null;
    observations: number;
    calendarDays: number;
    years: number;
  };
  candidateCount: number;
  validMatchCount: number;
  minimumSimilarity: number;
  coverage: number;
  modelVersion: PatternModelVersion;
}

export interface PatternAnalysis {
  symbol: string;
  assetClass: PatternAssetClass;
  modelVersion: PatternModelVersion;
  lookback: PatternLookback;
  lookbackObservations: number;
  outcomeObservations: number;
  reference: PatternReference;
  historicalObservedPath: PatternPathPoint[];
  matchedEvents: PatternMatchedEvent[];
  mostCorrelated: PatternMatchedEvent | null;
  averageLong: PatternAveragePath | null;
  averageShort: PatternAveragePath | null;
  probability: PatternProbability;
  robustness: PatternRobustness;
  strength: {
    classification: PatternStrength;
    direction: PatternDirection | "UNCERTAIN";
    dominantProbability: number | null;
  };
  quality: PatternQuality;
  metadata: {
    provider: string;
    source: string;
    sourceTimestamp: string | null;
    historyHash: string;
    configurationHash: string;
    neutralThreshold: number | null;
    topK: number;
    minimumSample: number;
    maximumOverlap: number;
    adjustedPrices: boolean;
  };
}

export interface PatternHistoryInput {
  points: MarketChartPoint[];
  provider?: string;
  source?: string;
  sourceTimestamp?: string | null;
}
