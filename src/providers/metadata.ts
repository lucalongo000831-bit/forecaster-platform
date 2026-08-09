import type { DataFreshness, DataQuality, FieldProvenance, FreshnessType, ProviderMetadata, ProviderName, ProviderResult } from "./types";

const freshnessTypeByLegacy: Record<DataFreshness, FreshnessType> = {
  realtime: "REALTIME",
  delayed: "DELAYED",
  cached: "CACHED",
  stale: "STALE",
};

function sourceDelaySeconds(sourceTimestamp: string | null | undefined) {
  if (!sourceTimestamp) return null;
  const timestamp = new Date(sourceTimestamp).getTime();
  return Number.isFinite(timestamp) ? Math.max(0, Math.floor((Date.now() - timestamp) / 1_000)) : null;
}

export function providerResult<T>(
  provider: ProviderName,
  data: T,
  options: {
    sourceTimestamp?: string | null;
    freshness?: DataFreshness;
    freshnessType?: FreshnessType;
    delaySeconds?: number | null;
    quality?: DataQuality;
    isFallback?: boolean;
    requestId?: string;
    lineage?: FieldProvenance[];
  } = {},
): ProviderResult<T> {
  const freshness = options.freshness ?? "delayed";
  const meta: ProviderMetadata = {
    provider,
    fetchedAt: new Date().toISOString(),
    sourceTimestamp: options.sourceTimestamp ?? null,
    freshness,
    freshnessType: options.freshnessType ?? freshnessTypeByLegacy[freshness],
    delaySeconds: options.delaySeconds ?? sourceDelaySeconds(options.sourceTimestamp),
    quality: options.quality ?? "verified",
    isFallback: options.isFallback ?? false,
    requestId: options.requestId,
    lineage: options.lineage,
  };
  return { data, meta };
}
