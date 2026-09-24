import type { ChartRange, MarketChartPoint, TechnicalHistoricalRange, TechnicalTimeframe } from "@/types";

export const TECHNICAL_RANGE_INTERVAL_COMPATIBILITY: Record<TechnicalTimeframe, ChartRange[]> = {
  "1m": ["1D"], "5m": ["1D", "5D"], "15m": ["1D", "5D", "1M"], "30m": ["1D", "5D", "1M"],
  "1h": ["1D", "5D", "1M", "3M"], "4h": ["1M", "3M"],
  "1D": ["1D", "5D", "1M", "3M", "6M", "YTD", "1Y", "3Y", "5Y", "10Y", "MAX"],
  "1W": ["3M", "6M", "YTD", "1Y", "3Y", "5Y", "10Y", "MAX"],
};
export function isTechnicalRangeCompatible(range: TechnicalHistoricalRange, timeframe: TechnicalTimeframe) { return range === "CUSTOM" ? ["1D", "1W"].includes(timeframe) : TECHNICAL_RANGE_INTERVAL_COMPATIBILITY[timeframe].includes(range); }
export function filterTechnicalRange(bars: MarketChartPoint[], range: TechnicalHistoricalRange, now = new Date(), custom?: { from: string | null; to: string | null }) {
  if (range === "MAX") return [...bars];
  const end = range === "CUSTOM" && custom?.to ? Date.parse(`${custom.to}T23:59:59.999Z`) : now.getTime();
  if (range === "CUSTOM") {
    if (!custom?.from || !custom.to || custom.from > custom.to) return [];
    const start = Date.parse(`${custom.from}T00:00:00.000Z`);
    if (start > now.getTime()) return [];
    const effectiveEnd = Math.min(end, now.getTime());
    return bars.filter((bar) => { const value = Date.parse(bar.timestamp); return value >= start && value <= effectiveEnd; });
  }
  const days: Partial<Record<TechnicalHistoricalRange, number>> = { "1D": 1, "5D": 5, "1M": 31, "3M": 92, "6M": 183, "1Y": 366, "3Y": 1_096, "5Y": 1_827, "10Y": 3_653 };
  const start = range === "YTD" ? Date.UTC(now.getUTCFullYear(), 0, 1) : end - (days[range] ?? 366) * 86_400_000;
  return bars.filter((bar) => { const value = Date.parse(bar.timestamp); return value >= start && value <= end; });
}
