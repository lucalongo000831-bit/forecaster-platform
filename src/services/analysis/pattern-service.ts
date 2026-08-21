import "server-only";

import {
  analyzePattern,
  patternHistoryIdentity,
  PATTERN_MODEL_VERSION,
  type PatternAssetClass,
  type PatternEngineOptions,
} from "@/engines/pattern";
import { cacheGet, cacheSet, privacySafeKey } from "@/lib/server/redis";
import { structuredLog } from "@/lib/server/logger";
import { financialProviderRouter } from "@/providers";
import { resolveInstrument } from "@/services/instruments/instrument-resolver";
import { normalizeSymbol } from "@/services/yahoo/symbol-resolver";
import {
  loadPatternAnalysisSnapshot,
  loadPatternHistory,
  loadPatternHistoryLkg,
  persistPatternAnalysis,
  persistPatternHistory,
  type PatternHistorySnapshot,
} from "./pattern-repository";

const ANALYSIS_CACHE_SECONDS = 6 * 3_600;

function assetClassFor(symbol: string, kind?: string | null): PatternAssetClass {
  if (kind === "CRYPTO" || symbol.endsWith("-USD")) return "CRYPTO";
  if (kind === "ETF" || kind === "FUND") return "ETF";
  return "EQUITY";
}

async function resolveAssetClass(symbol: string) {
  if (symbol.endsWith("-USD")) return "CRYPTO" as const;
  const instrument = await resolveInstrument(symbol).catch(() => null);
  return assetClassFor(symbol, instrument?.kind);
}

async function providerHistory(symbol: string, assetClass: PatternAssetClass): Promise<PatternHistorySnapshot> {
  const chart = await financialProviderRouter.seasonalityChart(symbol, 25);
  if (chart.data.points.length < 2) throw new Error("INSUFFICIENT_PATTERN_DATA");
  const payload: PatternHistorySnapshot = {
    symbol,
    assetClass,
    provider: chart.meta.provider,
    sourceTimestamp: chart.meta.sourceTimestamp ?? chart.data.asOf,
    fetchedAt: chart.meta.fetchedAt,
    selectionComplete: true,
    points: chart.data.points,
  };
  await persistPatternHistory(payload).catch((error) => structuredLog("warn", "pattern.history.persist.failed", { provider: chart.meta.provider, symbol, code: error instanceof Error ? error.name : "UNKNOWN" }));
  return payload;
}

async function obtainHistory(symbol: string, assetClass: PatternAssetClass) {
  const stored = await loadPatternHistory(symbol);
  if (stored && stored.status !== "STALE" && stored.payload.points.length >= 2 && stored.payload.selectionComplete) return { payload: stored.payload, source: "database:snapshot" };
  try {
    return { payload: await providerHistory(symbol, assetClass), source: "provider:live-history" };
  } catch (error) {
    const lkg = stored?.payload.points.length ? stored : await loadPatternHistoryLkg(symbol);
    if (lkg?.payload.points.length) {
      structuredLog("warn", "pattern.history.lkg", { provider: lkg.payload.provider, symbol, code: error instanceof Error ? error.name : "UNKNOWN" });
      return { payload: lkg.payload, source: "database:lkg" };
    }
    throw error;
  }
}

export async function getPatternAnalysis(symbolInput: string, requested: PatternEngineOptions = {}) {
  const symbol = normalizeSymbol(decodeURIComponent(symbolInput));
  const assetClass = requested.assetClass ?? await resolveAssetClass(symbol);
  const options: PatternEngineOptions = {
    ...requested,
    assetClass,
    lookback: requested.lookback ?? "1M",
    topK: requested.topK ?? 20,
    minimumSimilarity: requested.minimumSimilarity ?? 55,
    minimumSample: requested.minimumSample ?? 5,
    maximumOverlap: requested.maximumOverlap ?? 0.25,
  };
  const history = await obtainHistory(symbol, assetClass);
  const identity = patternHistoryIdentity(history.payload.points, assetClass, options.referenceDate);
  const cacheKey = `pattern:v2:${privacySafeKey(JSON.stringify({ symbol, referenceDate: identity.resolvedDate, lookback: options.lookback, modelVersion: PATTERN_MODEL_VERSION, historyHash: identity.historyHash, topK: options.topK, minimumSimilarity: options.minimumSimilarity, minimumSample: options.minimumSample, maximumOverlap: options.maximumOverlap }))}`;
  const cached = await cacheGet<ReturnType<typeof analyzePattern>>(cacheKey);
  if (cached) return cached;
  const persisted = await loadPatternAnalysisSnapshot(symbol, identity.resolvedDate, options.lookback ?? "1M", identity.historyHash);
  if (persisted && persisted.status !== "STALE" && persisted.payload.modelVersion === PATTERN_MODEL_VERSION) {
    const restored = { ...persisted.payload, metadata: { ...persisted.payload.metadata, source: `${persisted.payload.metadata.source}:analysis-snapshot` } };
    await cacheSet(cacheKey, restored, ANALYSIS_CACHE_SECONDS);
    return restored;
  }
  const analysis = analyzePattern(symbol, {
    points: history.payload.points,
    provider: history.payload.provider,
    source: history.source,
    sourceTimestamp: history.payload.sourceTimestamp,
  }, options);
  await cacheSet(cacheKey, analysis, ANALYSIS_CACHE_SECONDS);
  await persistPatternAnalysis(analysis).catch((error) => structuredLog("warn", "pattern.analysis.persist.failed", { provider: history.payload.provider, symbol, modelVersion: analysis.modelVersion, code: error instanceof Error ? error.name : "UNKNOWN" }));
  return analysis;
}
