import "server-only";

import type { PatternAnalysis } from "@/engines/pattern";
import { loadLastKnownGood, loadLatestSnapshot, publishDatasetSnapshot } from "@/services/data-v2";
import {
  loadSeasonalityHistory,
  loadSeasonalityHistoryLkg,
  persistSeasonalityHistory,
  type SeasonalityHistorySnapshot,
} from "./seasonality-repository";

const ANALYSIS_DATASET = "pattern_analysis_v2";

export type PatternHistorySnapshot = SeasonalityHistorySnapshot;

export const loadPatternHistory = loadSeasonalityHistory;
export const loadPatternHistoryLkg = loadSeasonalityHistoryLkg;
export const persistPatternHistory = persistSeasonalityHistory;

function analysisEntityKey(analysis: Pick<PatternAnalysis, "symbol" | "lookback" | "reference" | "metadata" | "modelVersion">) {
  return `${analysis.symbol}:${analysis.reference.resolvedDate ?? "unresolved"}:${analysis.lookback}:${analysis.modelVersion}:${analysis.metadata.historyHash}`;
}

export async function persistPatternAnalysis(analysis: PatternAnalysis) {
  return publishDatasetSnapshot({
    dataset: ANALYSIS_DATASET,
    entityKey: analysisEntityKey(analysis),
    payload: analysis as unknown as Record<string, unknown>,
    recordCount: analysis.matchedEvents.length,
    coverage: analysis.quality.coverage,
    sourceSucceeded: analysis.quality.status !== "INSUFFICIENT_HISTORY",
    schemaValid: analysis.modelVersion === "pattern-v2.0.0"
      && analysis.matchedEvents.every((event) => event.startDate <= event.matchEndDate && event.matchEndDate < event.outcomeEndDate),
    allowVerifiedEmpty: analysis.quality.status === "INSUFFICIENT_HISTORY" || analysis.quality.status === "INSUFFICIENT_SAMPLE",
    sourceTimestamp: analysis.metadata.sourceTimestamp,
    expiresAt: new Date(Date.now() + 24 * 3_600_000).toISOString(),
    freshness: analysis.metadata.source.includes("lkg") ? "STALE" : "FRESH",
    schemaVersion: "pattern-analysis-v2",
    modelVersion: analysis.modelVersion,
  });
}

export async function loadPatternAnalysisSnapshot(symbol: string, resolvedDate: string | null, lookback: string, historyHash: string) {
  const entityKey = `${symbol}:${resolvedDate ?? "unresolved"}:${lookback}:pattern-v2.0.0:${historyHash}`;
  const latest = await loadLatestSnapshot<PatternAnalysis>(ANALYSIS_DATASET, entityKey);
  if (latest?.payload.modelVersion === "pattern-v2.0.0") return latest;
  return loadLastKnownGood<PatternAnalysis>(ANALYSIS_DATASET, entityKey);
}
