"use client";

import type { PatternAnalysis, PatternLookback } from "@/engines/pattern";
import type { ApiSuccess } from "@/types";

const memoryCache = new Map<string, PatternAnalysis>();
const pending = new Map<string, Promise<PatternAnalysis>>();

function cacheKey(symbol: string, lookback: PatternLookback, referenceDate?: string) {
  return `${symbol.toUpperCase()}:${lookback}:${referenceDate ?? "LATEST"}`;
}

export function patternAnalysisRequestUrl(symbol: string, lookback: PatternLookback, referenceDate?: string) {
  const params = new URLSearchParams({ symbol: symbol.toUpperCase(), lookback });
  if (referenceDate) params.set("referenceDate", referenceDate);
  return `/api/analysis/pattern?${params.toString()}`;
}

export async function loadPatternAnalysis(symbol: string, lookback: PatternLookback = "1M", referenceDate?: string) {
  const key = cacheKey(symbol, lookback, referenceDate);
  const cached = memoryCache.get(key);
  if (cached) return cached;
  const active = pending.get(key);
  if (active) return active;
  const task = (async () => {
    let lastError: Error | null = null;
    for (let attempt = 0; attempt < 2; attempt += 1) {
      try {
        const response = await fetch(patternAnalysisRequestUrl(symbol, lookback, referenceDate));
        const body = await response.json() as ApiSuccess<PatternAnalysis> | { error?: { message?: string } };
        if (!response.ok || !("data" in body)) throw new Error("error" in body ? body.error?.message : "Pattern analysis unavailable");
        memoryCache.set(key, body.data);
        const resolvedKey = cacheKey(symbol, body.data.lookback, body.data.reference.resolvedDate ?? undefined);
        memoryCache.set(resolvedKey, body.data);
        if (body.data.reference.resolvedDate === body.data.reference.latestAvailableDate) memoryCache.set(cacheKey(symbol, body.data.lookback), body.data);
        return body.data;
      } catch (error) {
        lastError = error instanceof Error ? error : new Error("Pattern analysis temporarily unavailable.");
        if (attempt === 0) await new Promise((resolve) => window.setTimeout(resolve, 250));
      }
    }
    throw lastError ?? new Error("Pattern analysis temporarily unavailable.");
  })().finally(() => pending.delete(key));
  pending.set(key, task);
  return task;
}

export function cachedPatternAnalysis(symbol: string, lookback: PatternLookback = "1M") {
  return memoryCache.get(cacheKey(symbol, lookback)) ?? null;
}

export function prefetchPatternAnalysis(symbol: string) {
  void loadPatternAnalysis(symbol.toUpperCase()).catch(() => undefined);
}
