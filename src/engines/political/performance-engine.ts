import type { MarketChartPoint, PoliticalConfidence, PoliticalHistoricalStudy, PoliticalTradePerformance, PoliticalTransaction } from "@/types";

export const POLITICAL_PERFORMANCE_MODEL_VERSION = "political-performance-v1" as const;
const horizons = { "1D": 1, "5D": 5, "20D": 20, "60D": 60, "120D": 120 } as const;

function close(point: MarketChartPoint) { return point.adjustedClose ?? point.close; }
function firstAvailableIndex(points: MarketChartPoint[], date: string) { return points.findIndex((point) => point.timestamp.slice(0, 10) >= date); }
function returnAt(points: MarketChartPoint[], entryIndex: number, offset: number) { const exit = points[entryIndex + offset]; if (entryIndex < 0 || !exit) return null; const entry = close(points[entryIndex]!); return entry ? (close(exit) / entry - 1) * 100 : null; }
function confidence(sample: number): PoliticalConfidence { return sample >= 30 ? "VERY_HIGH" : sample >= 15 ? "HIGH" : sample >= 8 ? "MEDIUM" : sample >= 3 ? "LOW" : "VERY_LOW"; }
function mean(values: number[]) { return values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : null; }
function median(values: number[]) { if (!values.length) return null; const sorted = [...values].sort((a, b) => a - b); const middle = Math.floor(sorted.length / 2); return sorted.length % 2 ? sorted[middle]! : (sorted[middle - 1]! + sorted[middle]!) / 2; }
function deviation(values: number[]) { const average = mean(values); return average === null ? null : Math.sqrt(values.reduce((sum, value) => sum + (value - average) ** 2, 0) / values.length); }

export class PoliticalTradePerformanceEngine {
  calculate(transaction: PoliticalTransaction, priceHistory: MarketChartPoint[], benchmarkHistory: MarketChartPoint[], benchmarkSymbol = "SPY"): PoliticalTradePerformance {
    const points = [...priceHistory].sort((a, b) => a.timestamp.localeCompare(b.timestamp)); const benchmark = [...benchmarkHistory].sort((a, b) => a.timestamp.localeCompare(b.timestamp));
    const entryIndex = firstAvailableIndex(points, transaction.marketAvailableDate); const benchmarkIndex = firstAvailableIndex(benchmark, transaction.marketAvailableDate);
    const returns = Object.fromEntries(Object.entries(horizons).map(([label, days]) => [label, returnAt(points, entryIndex, days)])) as PoliticalTradePerformance["returns"];
    const relativeReturns = Object.fromEntries(Object.entries(horizons).map(([label, days]) => { const raw = returns[label as keyof typeof horizons]; const comparison = returnAt(benchmark, benchmarkIndex, days); return [label, raw === null || comparison === null ? null : raw - comparison]; })) as PoliticalTradePerformance["relativeReturns"];
    const entryPrice = entryIndex >= 0 ? close(points[entryIndex]!) : null; const window = entryIndex >= 0 ? points.slice(entryIndex + 1, entryIndex + 121) : [];
    const excursions = entryPrice ? window.map((point) => (close(point) / entryPrice - 1) * 100) : [];
    const relative20 = relativeReturns["20D"]; const classification = relative20 === null ? "INSUFFICIENT_HISTORY" : relative20 > 1 ? "OUTPERFORMED" : relative20 < -1 ? "UNDERPERFORMED" : "NEUTRAL";
    return { transactionId: transaction.id, symbol: transaction.symbol ?? "UNRESOLVED", benchmarkSymbol, marketAvailableDate: transaction.marketAvailableDate, entryPrice, returns, relativeReturns, maxFavorableExcursion: excursions.length ? Math.max(...excursions) : null, maxAdverseExcursion: excursions.length ? Math.min(...excursions) : null, classification, calculatedAt: new Date().toISOString(), modelVersion: POLITICAL_PERFORMANCE_MODEL_VERSION };
  }

  historicalStudy(transactions: PoliticalTransaction[], performances: PoliticalTradePerformance[]): PoliticalHistoricalStudy[] {
    const byId = new Map(performances.map((performance) => [performance.transactionId, performance]));
    return (["PURCHASE", "SALE"] as const).map((side) => {
      const selected = transactions.filter((transaction) => side === "PURCHASE" ? transaction.transactionType === "PURCHASE" : transaction.transactionType.startsWith("SALE")).flatMap((transaction) => byId.get(transaction.id) ? [byId.get(transaction.id)!] : []);
      const stats = (horizon: "5D" | "20D" | "60D" | "120D") => { const values = selected.map((item) => item.relativeReturns[horizon]).filter((value): value is number => value !== null); return { mean: mean(values), median: median(values), hit: values.length ? values.filter((value) => value > 0).length / values.length * 100 : null, deviation: deviation(values) }; };
      const entries = Object.fromEntries((["5D", "20D", "60D", "120D"] as const).map((horizon) => [horizon, stats(horizon)]));
      return { side, sampleSize: selected.length, confidence: confidence(selected.length), mean: Object.fromEntries(Object.entries(entries).map(([key, value]) => [key, value.mean])) as PoliticalHistoricalStudy["mean"], median: Object.fromEntries(Object.entries(entries).map(([key, value]) => [key, value.median])) as PoliticalHistoricalStudy["median"], hitRate: Object.fromEntries(Object.entries(entries).map(([key, value]) => [key, value.hit])) as PoliticalHistoricalStudy["hitRate"], standardDeviation: Object.fromEntries(Object.entries(entries).map(([key, value]) => [key, value.deviation])) as PoliticalHistoricalStudy["standardDeviation"] };
    });
  }
}

export function disclosuresKnownBy(transactions: PoliticalTransaction[], asOf: string) {
  return transactions.filter((transaction) => transaction.marketAvailableDate <= asOf);
}
