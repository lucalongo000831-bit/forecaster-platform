export const DATA_STATUSES = [
  "AVAILABLE",
  "STALE",
  "PARTIAL",
  "RATE_LIMITED",
  "SOURCE_UNAVAILABLE",
  "SOURCE_ERROR",
  "INSUFFICIENT_DATA",
  "INSUFFICIENT_HISTORY",
  "NOT_APPLICABLE",
  "UNSUPPORTED",
  "UNVERIFIED",
  "CONFLICT",
  "LOADING",
] as const;

export type DataStatus = typeof DATA_STATUSES[number];
export type DataFreshnessClass = "REALTIME" | "NEAR_REALTIME" | "FRESH" | "CACHED" | "STALE" | "ARCHIVAL";
export type SourceAuthority = "OFFICIAL_PRIMARY_SOURCE" | "DIRECT_STRUCTURED_SOURCE" | "NORMALIZED_PROVIDER" | "SECONDARY_PROVIDER" | "PROXY" | "DERIVED_ESTIMATE";
export type ProviderRole = "MARKET_DATA" | "FUNDAMENTALS" | "IDENTITY" | "MACRO" | "ENERGY" | "NEWS" | "POLITICAL" | "REGULATORY" | "CORPORATE_EVENTS" | "CRYPTO" | "POSITIONING" | "OFFICIAL_FILINGS";
export type ProviderRequestPriority = "CRITICAL" | "HIGH" | "NORMAL" | "LOW" | "BACKGROUND";

export interface TemporalSemantics {
  observedAt: string | null;
  effectiveAt: string | null;
  publishedAt: string | null;
  availableAt: string | null;
  fetchedAt: string;
  storedAt: string | null;
  updatedAt: string | null;
}

export interface SourcedDataPoint<T> extends TemporalSemantics {
  value: T | null;
  status: DataStatus;
  freshness: DataFreshnessClass;
  provider: string | null;
  sourceAuthority: SourceAuthority | null;
  confidence: number | null;
  isFallback: boolean;
  isLastKnownGood: boolean;
  reason: string | null;
}

export interface DatasetSnapshotEnvelope<T> {
  dataset: string;
  entityKey: string;
  schemaVersion: string;
  modelVersion: string | null;
  status: DataStatus;
  freshness: DataFreshnessClass;
  payload: T;
  recordCount: number;
  coverage: number | null;
  sourceTimestamp: string | null;
  calculatedAt: string;
  expiresAt: string | null;
  published: boolean;
  isLastKnownGood: boolean;
  qualityReasons: string[];
}

export interface QualityGateInput {
  previousRecordCount: number | null;
  previousCoverage: number | null;
  candidateRecordCount: number;
  candidateCoverage: number | null;
  sourceSucceeded: boolean;
  schemaValid: boolean;
  allowVerifiedEmpty?: boolean;
  maximumCoverageDrop?: number;
}

export interface QualityGateResult {
  accepted: boolean;
  status: DataStatus;
  reasons: string[];
  suspiciousEmpty: boolean;
  coverageDrop: number | null;
}
