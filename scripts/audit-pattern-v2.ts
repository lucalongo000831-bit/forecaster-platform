import "server-only";

import { analyzePattern, type PatternAnalysis, type PatternAssetClass } from "@/engines/pattern";
import { financialProviderRouter } from "@/providers";
import type { MarketChartPoint } from "@/types";

const GOLDEN_ASSETS: Array<{ symbol: string; assetClass: PatternAssetClass }> = [
  { symbol: "NVDA", assetClass: "EQUITY" },
  { symbol: "AAPL", assetClass: "EQUITY" },
  { symbol: "MSFT", assetClass: "EQUITY" },
  { symbol: "STLAM.MI", assetClass: "EQUITY" },
  { symbol: "SPY", assetClass: "ETF" },
  { symbol: "QQQ", assetClass: "ETF" },
  { symbol: "BTC-USD", assetClass: "CRYPTO" },
  { symbol: "ETH-USD", assetClass: "CRYPTO" },
];

function matchingIdentity(analysis: PatternAnalysis) {
  return {
    historyHash: analysis.metadata.historyHash,
    observed: analysis.historicalObservedPath,
    rankings: analysis.matchedEvents.map((event) => ({ id: event.id, rank: event.rank, similarity: event.similarity })),
    mostCorrelated: analysis.mostCorrelated,
    probability: analysis.probability,
    robustness: analysis.robustness,
    strength: analysis.strength,
  };
}

function mutateAfter(points: MarketChartPoint[], referenceDate: string) {
  return points.map((point) => point.timestamp.slice(0, 10) <= referenceDate ? { ...point } : {
    ...point,
    open: point.open * 11,
    high: point.high * 23,
    low: point.low * 0.05,
    close: point.close * 19,
    adjustedClose: (point.adjustedClose ?? point.close) * 0.09,
    volume: (point.volume ?? 1) * 101,
  });
}

async function auditAsset(symbol: string, assetClass: PatternAssetClass) {
  const providerStarted = performance.now();
  const history = await financialProviderRouter.seasonalityChart(symbol, 25);
  const providerMs = performance.now() - providerStarted;
  if (history.data.points.length < 800) throw new Error(`INSUFFICIENT_LIVE_HISTORY:${history.data.points.length}`);
  const historicalOffset = assetClass === "CRYPTO" ? 365 : 252;
  const referenceDate = history.data.points.at(-historicalOffset)!.timestamp.slice(0, 10);
  const calculationStarted = performance.now();
  const analyses = (["1M", "3M", "6M"] as const).map((lookback) => analyzePattern(symbol, {
    points: history.data.points,
    provider: history.meta.provider,
    source: "audit:live-history",
    sourceTimestamp: history.meta.sourceTimestamp,
  }, { assetClass, lookback }));
  const historical = analyzePattern(symbol, history.data.points, { assetClass, lookback: "3M", referenceDate, minimumSimilarity: 0 });
  const repeated = analyzePattern(symbol, mutateAfter(history.data.points, referenceDate), { assetClass, lookback: "3M", referenceDate, minimumSimilarity: 0 });
  if (JSON.stringify(matchingIdentity(historical)) !== JSON.stringify(matchingIdentity(repeated))) throw new Error("NO_LOOKAHEAD_FAILED");
  const deterministic = analyzePattern(symbol, history.data.points.map((point) => ({ ...point })), { assetClass, lookback: "3M", referenceDate, minimumSimilarity: 0 });
  if (JSON.stringify(historical) !== JSON.stringify(deterministic)) throw new Error("DETERMINISM_FAILED");
  const latest = analyses[0];
  const calculationMs = performance.now() - calculationStarted;
  return {
    symbol,
    assetClass,
    provider: history.meta.provider,
    firstDate: latest.quality.availableHistory.startDate,
    lastDate: latest.quality.availableHistory.endDate,
    observations: latest.quality.availableHistory.observations,
    calendarType: assetClass === "CRYPTO" ? "24_7" : "TRADING_SESSIONS",
    adjustmentType: assetClass === "CRYPTO" ? "RAW_CRYPTO_OHLC" : latest.metadata.adjustedPrices ? "ADJUSTED_OHLC" : "UNADJUSTED_OHLC",
    latestReference: latest.reference.resolvedDate,
    historicalReference: historical.reference.resolvedDate,
    statuses: Object.fromEntries(analyses.map((analysis) => [analysis.lookback, analysis.quality.status])),
    noLookahead: true,
    deterministic: true,
    providerMs: Number(providerMs.toFixed(1)),
    calculationMs: Number(calculationMs.toFixed(1)),
  };
}

async function main() {
  const rows: Awaited<ReturnType<typeof auditAsset>>[] = [];
  const failures: Array<{ symbol: string; error: string }> = [];
  for (const asset of GOLDEN_ASSETS) {
    try {
      const row = await auditAsset(asset.symbol, asset.assetClass);
      rows.push(row);
      console.log(JSON.stringify({ type: "pattern-v2-audit", ...row }));
    } catch (error) {
      const message = error instanceof Error ? `${error.name}: ${error.message}` : "Unknown audit error";
      failures.push({ symbol: asset.symbol, error: message });
      console.error(JSON.stringify({ type: "pattern-v2-audit-failure", symbol: asset.symbol, error: message }));
    }
  }
  console.log(JSON.stringify({ type: "pattern-v2-audit-summary", passed: rows.length, failed: failures.length, symbols: rows.map((row) => row.symbol) }));
  if (failures.length) process.exitCode = 1;
}

void main();
