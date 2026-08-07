import type { SeasonalityAnalysis } from "@/engines/seasonality";
import type { TechnicalAnalysis } from "@/engines/technical";
import type { CompanyConfidence, CompanySeasonalityWindow, DailyOutlook, MarketCalendarEvent, OperationalCalendarDay } from "@/types";

export const DAILY_OUTLOOK_MODEL_VERSION = "daily-outlook-v1.0.0";

function confidence(completeness: number, atr: number | null): CompanyConfidence { return completeness >= 80 && atr !== null ? "HIGH" : completeness >= 55 ? "MEDIUM" : completeness >= 30 ? "LOW" : "VERY_LOW"; }

export function analyzeDailyOutlook(input: { technical: TechnicalAnalysis; marketState: string; open: number | null; high: number | null; low: number | null; previousClose: number | null }): DailyOutlook {
  const atr = input.technical.volatility.atr14.value;
  const price = input.technical.price;
  const support1 = input.technical.structure.support20 ?? input.technical.structure.swingLow;
  const resistance1 = input.technical.structure.resistance20 ?? input.technical.structure.swingHigh;
  const expectedRange: [number, number] | null = atr === null ? null : [Math.max(0, price - atr), price + atr];
  const state = input.marketState.toUpperCase();
  const marketPhase = state.includes("PRE") ? "PRE_MARKET" : state.includes("POST") ? "POST_MARKET" : state.includes("OPEN") || state === "REGULAR" ? "OPEN" : state.includes("CLOSED") ? "CLOSED" : "UNKNOWN";
  const centralTarget = atr === null ? null : price + (input.technical.score - 50) / 50 * atr;
  return {
    marketPhase, currentPrice: price, open: input.open, high: input.high, low: input.low, previousClose: input.previousClose, atr,
    expectedVolatility: input.technical.volatility.realized20, support1, support2: support1 === null || atr === null ? null : Math.max(0, support1 - atr), resistance1, resistance2: resistance1 === null || atr === null ? null : resistance1 + atr,
    expectedRange, centralTarget, invalidation: input.technical.score >= 50 ? support1 : resistance1, confidence: confidence(input.technical.completeness, atr),
    note: marketPhase === "OPEN" ? "Intraday model output based on the latest available bar, ATR, structure and volume." : "Market is not in the regular session; this is a next-session model estimate, not a live trading target.",
  };
}

export function summarizeSeasonality(analyses: SeasonalityAnalysis[]): CompanySeasonalityWindow[] {
  return analyses.flatMap((analysis): CompanySeasonalityWindow[] => {
    if (!["1Y", "5Y", "10Y", "15Y", "20Y"].includes(analysis.window)) return [];
    const annual = analysis.annualReturns;
    const sorted = [...annual].sort((a, b) => a - b);
    const mean = annual.length ? annual.reduce((sum, value) => sum + value, 0) / annual.length : null;
    const median = sorted.length ? sorted[Math.floor(sorted.length / 2)] : null;
    const hitRate = annual.length ? annual.filter((value) => value > 0).length / annual.length : null;
    const variance = mean === null || annual.length < 2 ? null : annual.reduce((sum, value) => sum + (value - mean) ** 2, 0) / (annual.length - 1);
    const direction = analysis.quality === "INSUFFICIENT" || mean === null ? "INSUFFICIENT" : mean > 0.03 && (hitRate ?? 0) >= 0.55 ? "FAVORABLE" : mean < -0.03 && (hitRate ?? 1) <= 0.45 ? "UNFAVORABLE" : "NEUTRAL";
    return [{ window: analysis.window as CompanySeasonalityWindow["window"], mean, median, hitRate, standardDeviation: variance === null ? null : Math.sqrt(variance), best: sorted.at(-1) ?? null, worst: sorted[0] ?? null, observations: annual.length, quality: analysis.quality, direction, provider: analysis.provider }];
  });
}

export function buildOperationalCalendar(input: { start: Date; days: number; events: MarketCalendarEvent[]; daily: DailyOutlook | null; orientation: "LONG" | "NEUTRAL" | "SHORT" }): OperationalCalendarDay[] {
  return Array.from({ length: Math.max(1, Math.min(input.days, 42)) }, (_, offset) => {
    const date = new Date(input.start); date.setUTCDate(date.getUTCDate() + offset); const iso = date.toISOString().slice(0, 10);
    const events = input.events.filter((event) => event.date.slice(0, 10) === iso);
    const elevatedRisk = events.some((event) => event.importance === "HIGH" || event.type === "EARNINGS");
    return { date: iso, orientation: input.orientation, action: input.orientation === "LONG" ? "BUY" : input.orientation === "SHORT" ? "SELL" : "HOLD", confidence: elevatedRisk ? "LOW" : input.daily?.confidence ?? "VERY_LOW", expectedRange: input.daily?.expectedRange ?? null, target: input.daily?.centralTarget ?? null, support: input.daily?.support1 ?? null, resistance: input.daily?.resistance1 ?? null, events: events.map((event) => ({ title: event.title, type: event.type, status: "CONFIRMED", provider: event.provider })), elevatedRisk };
  });
}
