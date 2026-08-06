import type { DataFreshness, DataQuality, ProviderMetadata, ProviderName, ProviderResult } from "./types";

export function providerResult<T>(
  provider: ProviderName,
  data: T,
  options: {
    sourceTimestamp?: string | null;
    freshness?: DataFreshness;
    quality?: DataQuality;
    isFallback?: boolean;
  } = {},
): ProviderResult<T> {
  const meta: ProviderMetadata = {
    provider,
    fetchedAt: new Date().toISOString(),
    sourceTimestamp: options.sourceTimestamp ?? null,
    freshness: options.freshness ?? "delayed",
    quality: options.quality ?? "verified",
    isFallback: options.isFallback ?? false,
  };
  return { data, meta };
}
