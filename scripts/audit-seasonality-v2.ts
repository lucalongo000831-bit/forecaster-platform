import "server-only";

import { analyzeSeasonality, normalizeSeasonalityBars, SEASONALITY_HISTORICAL_WINDOWS, type SeasonalityAssetClass } from "@/engines/seasonality";
import { financialProviderRouter } from "@/providers";

const GOLDEN_ASSETS: Array<{ symbol: string; assetClass: SeasonalityAssetClass }> = [
  { symbol: "NVDA", assetClass: "EQUITY" },
  { symbol: "AAPL", assetClass: "EQUITY" },
  { symbol: "MSFT", assetClass: "EQUITY" },
  { symbol: "STLAM.MI", assetClass: "EQUITY" },
  { symbol: "SPY", assetClass: "ETF" },
  { symbol: "QQQ", assetClass: "ETF" },
  { symbol: "BTC-USD", assetClass: "CRYPTO" },
  { symbol: "ETH-USD", assetClass: "CRYPTO" },
];

interface AuditRow {
  symbol: string;
  assetClass: SeasonalityAssetClass;
  firstDataDate: string;
  lastDataDate: string;
  completedYears: number;
  tradingObservations: number;
  provider: string;
  adjustmentStatus: "RAW_CRYPTO_OHLC" | "ADJUSTED_OHLC_OBSERVED" | "NO_ADJUSTMENT_EVENT_OBSERVED";
  providerMs: number;
  calculationMs: number;
  quality: string;
}

async function auditAsset(symbol: string, assetClass: SeasonalityAssetClass): Promise<AuditRow> {
  const providerStarted = performance.now();
  const response = await financialProviderRouter.seasonalityChart(symbol, 25);
  const providerMs = performance.now() - providerStarted;
  const calculationStarted = performance.now();
  const analysis = analyzeSeasonality(symbol, response.data.points, {
    assetClass,
    windows: [...SEASONALITY_HISTORICAL_WINDOWS],
    includeCorrelations: true,
    includeCycles: true,
    includeTable: true,
    includeTradeStats: true,
    now: new Date(),
  }, response.meta.provider, "audit:live-history");
  const calculationMs = performance.now() - calculationStarted;
  const normalized = normalizeSeasonalityBars(response.data.points, assetClass);
  const adjustmentObserved = assetClass !== "CRYPTO" && normalized.some((bar) => Math.abs(bar.adjustmentFactor - 1) > 1e-8);
  return {
    symbol,
    assetClass,
    firstDataDate: analysis.availableHistory.firstDate,
    lastDataDate: analysis.availableHistory.lastDate,
    completedYears: analysis.availableHistory.availableYears,
    tradingObservations: analysis.availableHistory.observations,
    provider: response.meta.provider,
    adjustmentStatus: assetClass === "CRYPTO" ? "RAW_CRYPTO_OHLC" : adjustmentObserved ? "ADJUSTED_OHLC_OBSERVED" : "NO_ADJUSTMENT_EVENT_OBSERVED",
    providerMs: Number(providerMs.toFixed(1)),
    calculationMs: Number(calculationMs.toFixed(1)),
    quality: analysis.quality,
  };
}

async function main() {
  const rows: AuditRow[] = [];
  const failures: Array<{ symbol: string; error: string }> = [];
  for (const asset of GOLDEN_ASSETS) {
    try {
      const row = await auditAsset(asset.symbol, asset.assetClass);
      rows.push(row);
      console.log(JSON.stringify({ type: "seasonality-audit", ...row }));
    } catch (error) {
      const message = error instanceof Error ? `${error.name}: ${error.message}` : "Unknown audit error";
      failures.push({ symbol: asset.symbol, error: message });
      console.error(JSON.stringify({ type: "seasonality-audit-failure", symbol: asset.symbol, error: message }));
    }
  }
  console.log(JSON.stringify({ type: "seasonality-audit-summary", passed: rows.length, failed: failures.length, symbols: rows.map((row) => row.symbol) }));
  if (failures.length) process.exitCode = 1;
}

void main();
