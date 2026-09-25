import type { MarketChartPoint, TechnicalCrossAssetPoint, TechnicalCrossAssetResult } from "@/types";

function stats(values: number[]) {
  if (values.length < 2) return { mean: 0, variance: 0, deviation: 0 };
  const mean = values.reduce((sum, value) => sum + value, 0) / values.length;
  const variance = values.reduce((sum, value) => sum + (value - mean) ** 2, 0) / (values.length - 1);
  return { mean, variance, deviation: Math.sqrt(variance) };
}
function correlation(left: number[], right: number[]) {
  if (left.length !== right.length || left.length < 3) return null;
  const a = stats(left); const b = stats(right);
  if (!a.deviation || !b.deviation) return null;
  return left.reduce((sum, value, index) => sum + (value - a.mean) * (right[index]! - b.mean), 0) / ((left.length - 1) * a.deviation * b.deviation);
}
function returns(values: number[]) { return values.slice(1).map((value, index) => value / values[index]! - 1); }

export function defaultTechnicalBenchmark(symbolInput: string) {
  const symbol = symbolInput.toUpperCase();
  if (["AAPL", "MSFT", "NVDA"].includes(symbol)) return "QQQ";
  if (symbol === "QQQ") return "SPY";
  if (symbol === "SPY") return "QQQ";
  if (symbol.endsWith(".MI")) return "^STOXX50E";
  if (symbol === "BTC-USD") return "ETH-USD";
  if (symbol.endsWith("-USD")) return "BTC-USD";
  return "SPY";
}

export function calculateCrossAssetContext(assetBars: MarketChartPoint[], benchmarkBars: MarketChartPoint[], benchmark: string): TechnicalCrossAssetResult {
  const byTime = new Map(benchmarkBars.map((bar) => [bar.timestamp, bar.close]));
  const aligned = assetBars.flatMap((bar) => { const close = byTime.get(bar.timestamp); return close && close > 0 && bar.close > 0 ? [{ timestamp: bar.timestamp, asset: bar.close, benchmark: close }] : []; });
  const unavailable: TechnicalCrossAssetResult = { status: "INSUFFICIENT_DATA", reason: "MINIMUM_20_OVERLAPPING_OBSERVATIONS_REQUIRED", benchmark, points: [], beta: null, assetVolatility: null, benchmarkVolatility: null, relativeVolatility: null, context: "UNAVAILABLE", overlapStart: aligned[0]?.timestamp ?? null, overlapEnd: aligned.at(-1)?.timestamp ?? null, modelVersion: "cross-asset-v1.0.0" };
  if (aligned.length < 20) return unavailable;
  const assetBase = aligned[0]!.asset; const benchmarkBase = aligned[0]!.benchmark;
  const assetReturns = returns(aligned.map((row) => row.asset));
  const benchmarkReturns = returns(aligned.map((row) => row.benchmark));
  const points: TechnicalCrossAssetPoint[] = aligned.map((row, index) => {
    const normalizedAsset = row.asset / assetBase * 100; const normalizedBenchmark = row.benchmark / benchmarkBase * 100;
    const left = assetReturns.slice(Math.max(0, index - 20), index); const right = benchmarkReturns.slice(Math.max(0, index - 20), index);
    const left60 = assetReturns.slice(Math.max(0, index - 60), index); const right60 = benchmarkReturns.slice(Math.max(0, index - 60), index);
    return { timestamp: row.timestamp, asset: normalizedAsset, benchmark: normalizedBenchmark, relativeStrength: normalizedAsset / normalizedBenchmark * 100, correlation20: left.length >= 20 ? correlation(left, right) : null, correlation60: left60.length >= 60 ? correlation(left60, right60) : null };
  });
  const benchmarkStats = stats(benchmarkReturns); const assetStats = stats(assetReturns);
  const covariance = assetReturns.reduce((sum, value, index) => sum + (value - assetStats.mean) * (benchmarkReturns[index]! - benchmarkStats.mean), 0) / Math.max(1, assetReturns.length - 1);
  const annualizer = Math.sqrt(252);
  const relativeStrength = points.at(-1)!.relativeStrength;
  return { status: "AVAILABLE", reason: null, benchmark, points, beta: benchmarkStats.variance ? covariance / benchmarkStats.variance : null, assetVolatility: assetStats.deviation * annualizer, benchmarkVolatility: benchmarkStats.deviation * annualizer, relativeVolatility: benchmarkStats.deviation ? assetStats.deviation / benchmarkStats.deviation : null, context: relativeStrength > 102 ? "OUTPERFORMING" : relativeStrength < 98 ? "UNDERPERFORMING" : "NEUTRAL", overlapStart: aligned[0]!.timestamp, overlapEnd: aligned.at(-1)!.timestamp, modelVersion: "cross-asset-v1.0.0" };
}
