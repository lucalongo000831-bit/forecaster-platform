import "server-only";

import { cacheGet, cacheSet } from "@/lib/server/redis";
import { structuredLog } from "@/lib/server/logger";
import type { ProviderResult } from "./types";

interface CachedProviderResult<T> {
  result: ProviderResult<T>;
  freshUntil: number;
}

const pending = new Map<string, Promise<ProviderResult<unknown>>>();

export interface ProviderCachePolicy {
  freshSeconds: number;
  staleSeconds: number;
}

async function loadAndStore<T>(key: string, policy: ProviderCachePolicy, loader: () => Promise<ProviderResult<T>>) {
  const existing = pending.get(key) as Promise<ProviderResult<T>> | undefined;
  if (existing) return existing;
  const task = loader().then(async (result) => {
    await cacheSet(`provider:${key}`, { result, freshUntil: Date.now() + policy.freshSeconds * 1_000 }, policy.freshSeconds + policy.staleSeconds);
    return result;
  }).finally(() => pending.delete(key));
  pending.set(key, task as Promise<ProviderResult<unknown>>);
  return task;
}

export async function providerCached<T>(key: string, policy: ProviderCachePolicy, loader: () => Promise<ProviderResult<T>>): Promise<ProviderResult<T>> {
  const cached = await cacheGet<CachedProviderResult<T>>(`provider:${key}`);
  if (cached && cached.freshUntil > Date.now()) {
    structuredLog("info", "provider.cache.hit", { operation: key, cache: "fresh" });
    return { ...cached.result, meta: { ...cached.result.meta, freshness: "cached", freshnessType: "CACHED" } };
  }
  if (cached) {
    structuredLog("info", "provider.cache.hit", { operation: key, cache: "stale" });
    void loadAndStore(key, policy, loader).catch((error) => {
      structuredLog("warn", "provider.cache.revalidation_failed", { operation: key, code: error instanceof Error ? error.name : "UNKNOWN" });
    });
    return { ...cached.result, meta: { ...cached.result.meta, freshness: "stale", freshnessType: "STALE" } };
  }
  structuredLog("info", "provider.cache.miss", { operation: key, cache: "miss" });
  return loadAndStore(key, policy, loader);
}
