export type KairoDataV2ProviderName = "fred" | "bls" | "bea" | "eia" | "marketaux" | "openfigi" | "gleif" | "treasury" | "ecb" | "eurostat" | "cftc" | "house" | "senate";

export enum ProviderHealthStatus {
  HEALTHY = "HEALTHY",
  DEGRADED = "DEGRADED",
  RATE_LIMITED = "RATE_LIMITED",
  OFFLINE = "OFFLINE",
  DISABLED = "DISABLED",
  UNKNOWN = "UNKNOWN",
}

export interface ProviderQuotaPolicy {
  provider: KairoDataV2ProviderName;
  requestsPerMinute: number | null;
  requestsPerHour: number | null;
  requestsPerDay: number | null;
  burstLimit: number | null;
  reservedRequests: number | null;
  backgroundBudget: number | null;
  interactiveBudget: number | null;
  enabled: boolean;
  notes: string;
}

export type ProviderSmokeStatus = "OK" | "AUTH_ERROR" | "RATE_LIMIT" | "ERROR";
