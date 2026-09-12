import type { FreshnessType } from "@/providers/types";
import type { QuoteResponse } from "@/types";

const OPEN_MARKET_STATUSES = new Set(["Market open", "Extended hours"]);

export function instrumentQuoteRefreshIntervalMs(marketStatus: string, freshnessType?: FreshnessType | string | null): number {
  if (!OPEN_MARKET_STATUSES.has(marketStatus)) return 60_000;
  if (freshnessType === "REALTIME" || freshnessType === "NEAR_REALTIME") return 15_000;
  if (freshnessType === "CACHED") return 30_000;
  return 60_000;
}

export function isUsableQuoteResponse(value: unknown): value is QuoteResponse {
  if (!value || typeof value !== "object" || !("data" in value) || !("meta" in value)) return false;
  const data = (value as { data?: unknown }).data;
  if (!data || typeof data !== "object" || Array.isArray(data)) return false;
  const candidate = data as Record<string, unknown>;
  return Number.isFinite(candidate.price)
    && Number.isFinite(candidate.change)
    && Number.isFinite(candidate.changePercent)
    && typeof candidate.currency === "string"
    && candidate.currency.length > 0;
}
