import "server-only";

import {
  analyzeSeasonality,
  normalizeSeasonalityBars,
  SEASONALITY_HISTORICAL_WINDOWS,
  seasonalityConfigurationHash,
  seasonalityHistoryHash,
  type SeasonalityAssetClass,
  type SeasonalityEngineOptions,
  type SeasonalityHistoricalWindow,
} from "@/engines/seasonality";
import { cacheGet, cacheSet, privacySafeKey } from "@/lib/server/redis";
import { structuredLog } from "@/lib/server/logger";
import { financialProviderRouter } from "@/providers";
import { resolveInstrument } from "@/services/instruments/instrument-resolver";
import { normalizeSymbol } from "@/services/yahoo/symbol-resolver";
import {
  loadSeasonalityHistory,
  loadSeasonalityHistoryLkg,
  loadSeasonalityAnalysisSnapshot,
  persistSeasonalityAnalysis,
  persistSeasonalityHistory,
  type SeasonalityHistorySnapshot,
} from "./seasonality-repository";

const ANALYSIS_CACHE_SECONDS = 6 * 3_600;

function assetClassFor(symbol: string, kind?: string | null): SeasonalityAssetClass {
  if (kind === "CRYPTO" || symbol.endsWith("-USD")) return "CRYPTO";
  if (kind === "ETF" || kind === "FUND") return "ETF";
  return "EQUITY";
}

function optionsKey(options: SeasonalityEngineOptions) {
  return JSON.stringify({
    windows: options.windows,
    selectedMonth: options.selectedMonth,
    rangeStart: options.rangeStart,
    rangeEnd: options.rangeEnd,
    side: options.side,
    includeCycles: options.includeCycles,
    includeCorrelations: options.includeCorrelations,
    includeTradeStats: options.includeTradeStats,
    includeTable: options.includeTable,
  });
}

async function resolveAssetClass(symbol: string) {
  if (symbol.endsWith("-USD")) return "CRYPTO" as const;
  const instrument = await resolveInstrument(symbol).catch(() => null);
  return assetClassFor(symbol, instrument?.kind);
}

async function providerHistory(symbol: string, assetClass: SeasonalityAssetClass): Promise<SeasonalityHistorySnapshot> {
  const chart = await financialProviderRouter.seasonalityChart(symbol, 25);
  if (chart.data.points.length < 2) throw new Error("INSUFFICIENT_SEASONALITY_DATA");
  const payload: SeasonalityHistorySnapshot = {
    symbol,
    assetClass,
    provider: chart.meta.provider,
    sourceTimestamp: chart.meta.sourceTimestamp ?? chart.data.asOf,
    fetchedAt: chart.meta.fetchedAt,
    selectionComplete: true,
    points: chart.data.points,
  };
  await persistSeasonalityHistory(payload).catch((error) => structuredLog("warn", "seasonality.history.persist.failed", { provider: chart.meta.provider, symbol, code: error instanceof Error ? error.name : "UNKNOWN" }));
  return payload;
}

async function obtainHistory(symbol: string, assetClass: SeasonalityAssetClass) {
  const stored = await loadSeasonalityHistory(symbol);
  if (stored && stored.status !== "STALE" && stored.payload.points.length >= 2 && stored.payload.selectionComplete) return { payload: stored.payload, source: "database:snapshot" };
  try {
    return { payload: await providerHistory(symbol, assetClass), source: "provider:live-history" };
  } catch (error) {
    const lkg = stored?.payload.points.length ? stored : await loadSeasonalityHistoryLkg(symbol);
    if (lkg?.payload.points.length) {
      structuredLog("warn", "seasonality.history.lkg", { provider: lkg.payload.provider, symbol, code: error instanceof Error ? error.name : "UNKNOWN" });
      return { payload: lkg.payload, source: "database:lkg" };
    }
    throw error;
  }
}

export async function getSeasonalityAnalysis(symbolInput: string, windowOrOptions: SeasonalityHistoricalWindow | SeasonalityEngineOptions = { windows: [...SEASONALITY_HISTORICAL_WINDOWS] }) {
  const symbol = normalizeSymbol(decodeURIComponent(symbolInput));
  const requested = typeof windowOrOptions === "string" ? { windows: [windowOrOptions] } : windowOrOptions;
  const assetClass = requested.assetClass ?? await resolveAssetClass(symbol);
  const options: SeasonalityEngineOptions = {
    ...requested,
    assetClass,
    windows: requested.windows?.length ? requested.windows : [...SEASONALITY_HISTORICAL_WINDOWS],
    selectedMonth: requested.selectedMonth ?? new Date().getUTCMonth() + 1,
    rangeStart: requested.rangeStart ?? "01-01",
    rangeEnd: requested.rangeEnd ?? "12-31",
    side: requested.side ?? "LONG",
    includeCycles: requested.includeCycles ?? true,
    includeCorrelations: requested.includeCorrelations ?? true,
    includeTradeStats: requested.includeTradeStats ?? true,
    includeTable: requested.includeTable ?? true,
  };
  const history = await obtainHistory(symbol, assetClass);
  const historyHash = seasonalityHistoryHash(normalizeSeasonalityBars(history.payload.points, assetClass));
  const configurationHash = seasonalityConfigurationHash(options);
  const cacheKey = `seasonality:v2:${privacySafeKey(`${symbol}:${historyHash}:${configurationHash}:${optionsKey(options)}`)}`;
  const cached = await cacheGet<ReturnType<typeof analyzeSeasonality>>(cacheKey);
  if (cached) return cached;
  const persisted = await loadSeasonalityAnalysisSnapshot(symbol, historyHash, configurationHash);
  if (persisted && persisted.status !== "STALE" && persisted.payload.modelVersion === "seasonality-v2.0.0") {
    const restored = { ...persisted.payload, source: `${persisted.payload.source}:analysis-snapshot` };
    await cacheSet(cacheKey, restored, ANALYSIS_CACHE_SECONDS);
    return restored;
  }
  const analysis = analyzeSeasonality(symbol, history.payload.points, options, history.payload.provider, history.source);
  await cacheSet(cacheKey, analysis, ANALYSIS_CACHE_SECONDS);
  await persistSeasonalityAnalysis(analysis).catch((error) => structuredLog("warn", "seasonality.analysis.persist.failed", { provider: history.payload.provider, symbol, modelVersion: analysis.modelVersion, code: error instanceof Error ? error.name : "UNKNOWN" }));
  return analysis;
}
