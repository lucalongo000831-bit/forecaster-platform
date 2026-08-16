import "server-only";

import type { MarketChartPoint } from "@/types";
import type { SeasonalityAnalysis, SeasonalityAssetClass } from "@/engines/seasonality";
import { loadLastKnownGood, loadLatestSnapshot, publishDatasetSnapshot } from "@/services/data-v2";

const HISTORY_DATASET = "seasonality_daily_history_v2";
const ANALYSIS_DATASET = "seasonality_analysis_v2";

export interface SeasonalityHistorySnapshot extends Record<string, unknown> {
  symbol: string;
  assetClass: SeasonalityAssetClass;
  provider: string;
  sourceTimestamp: string | null;
  fetchedAt: string;
  selectionComplete?: boolean;
  points: MarketChartPoint[];
}

export async function loadSeasonalityHistory(symbol: string) {
  const latest = await loadLatestSnapshot<SeasonalityHistorySnapshot>(HISTORY_DATASET, symbol);
  if (latest?.payload.points?.length) return latest;
  return loadLastKnownGood<SeasonalityHistorySnapshot>(HISTORY_DATASET, symbol);
}

export async function loadSeasonalityHistoryLkg(symbol: string) {
  return loadLastKnownGood<SeasonalityHistorySnapshot>(HISTORY_DATASET, symbol);
}

export async function persistSeasonalityHistory(payload: SeasonalityHistorySnapshot) {
  return publishDatasetSnapshot({
    dataset: HISTORY_DATASET,
    entityKey: payload.symbol,
    payload,
    recordCount: payload.points.length,
    coverage: payload.points.length >= 250 ? 100 : null,
    sourceSucceeded: payload.points.length >= 2,
    schemaValid: payload.points.every((point) => Boolean(point.timestamp) && Number.isFinite(point.close) && point.close > 0),
    allowVerifiedEmpty: false,
    sourceTimestamp: payload.sourceTimestamp,
    expiresAt: new Date(Date.now() + 26 * 3_600_000).toISOString(),
    freshness: "FRESH",
    schemaVersion: "seasonality-daily-history-v2",
    modelVersion: "seasonality-v2.0.0",
  });
}

export async function persistSeasonalityAnalysis(analysis: SeasonalityAnalysis) {
  return publishDatasetSnapshot({
    dataset: ANALYSIS_DATASET,
    entityKey: `${analysis.symbol}:${analysis.historyHash}:${analysis.configurationHash}`,
    payload: analysis as unknown as Record<string, unknown>,
    recordCount: analysis.observations,
    coverage: analysis.availableYears ? Math.min(100, analysis.availableYears / 20 * 100) : null,
    sourceSucceeded: analysis.observations >= 2,
    schemaValid: analysis.modelVersion === "seasonality-v2.0.0" && analysis.curves.every((curve) => !curve.available || curve.points.length > 0),
    allowVerifiedEmpty: false,
    sourceTimestamp: analysis.dataTimestamp,
    expiresAt: new Date(Date.now() + 24 * 3_600_000).toISOString(),
    freshness: analysis.source.includes("lkg") ? "STALE" : "FRESH",
    schemaVersion: "seasonality-analysis-v2",
    modelVersion: analysis.modelVersion,
  });
}

export async function loadSeasonalityAnalysisSnapshot(symbol: string, historyHash: string, configurationHash: string) {
  return loadLatestSnapshot<SeasonalityAnalysis>(ANALYSIS_DATASET, `${symbol}:${historyHash}:${configurationHash}`);
}
