import type { MarketChartPoint } from "@/types";
import { clamp, mean, median, percentile, sampleStandardDeviation } from "../shared/statistics";
import { SEASONALITY_MODEL_VERSION, type SeasonalityAnalysis, type SeasonalityBucket, type SeasonalityQuality, type SeasonalityWindow } from "./types";

interface Observation { key: number; value: number; sequence: number }
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

function normalCdf(value: number) {
  const sign = value < 0 ? -1 : 1; const x = Math.abs(value) / Math.sqrt(2); const t = 1 / (1 + 0.3275911 * x);
  const erf = 1 - (((((1.061405429 * t - 1.453152027) * t) + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t * Math.exp(-x * x);
  return 0.5 * (1 + sign * erf);
}

function qualityFor(observations: number, years: number, descriptiveOnly: boolean): SeasonalityQuality {
  if (descriptiveOnly || observations < 3 || years < 2) return "INSUFFICIENT";
  if (observations < 5 || years < 5) return "LOW";
  if (observations < 12 || years < 10) return "MEDIUM";
  return "HIGH";
}

function summarize(key: number, label: string, observations: Observation[], years: number, descriptiveOnly: boolean): SeasonalityBucket {
  const values = observations.map((item) => item.value).filter(Number.isFinite);
  const average = mean(values); const deviation = sampleStandardDeviation(values); const med = median(values);
  const standardError = deviation === null || values.length === 0 ? null : deviation / Math.sqrt(values.length);
  const midpoint = Math.floor(observations.length / 2); const firstMean = mean(observations.slice(0, midpoint).map((item) => item.value)); const secondMean = mean(observations.slice(midpoint).map((item) => item.value));
  const stability = firstMean === null || secondMean === null || deviation === null || deviation === 0 ? null : clamp(100 - Math.abs(firstMean - secondMean) / deviation * 25, 0, 100);
  const z = average === null || standardError === null || standardError === 0 || values.length < 5 ? null : average / standardError;
  return { key, label, mean: average, median: med, hitRate: values.length ? values.filter((value) => value > 0).length / values.length * 100 : null, standardDeviation: deviation, percentile10: percentile(values, 0.1), percentile25: percentile(values, 0.25), percentile50: med, percentile75: percentile(values, 0.75), percentile90: percentile(values, 0.9), best: values.length ? Math.max(...values) : null, worst: values.length ? Math.min(...values) : null, observations: values.length, confidenceLow: average === null || standardError === null ? null : average - 1.96 * standardError, confidenceHigh: average === null || standardError === null ? null : average + 1.96 * standardError, pValue: z === null ? null : 2 * (1 - normalCdf(Math.abs(z))), stability, quality: qualityFor(values.length, years, descriptiveOnly) };
}

function weekOfYear(date: Date) {
  const start = new Date(Date.UTC(date.getUTCFullYear(), 0, 1));
  return Math.floor((date.getTime() - start.getTime()) / 86_400_000 / 7) + 1;
}

function normalize(input: MarketChartPoint[]) {
  const map = new Map<string, MarketChartPoint>();
  for (const point of input) if (point.timestamp && Number.isFinite(point.adjustedClose ?? point.close) && (point.adjustedClose ?? point.close) > 0) map.set(point.timestamp, point);
  return [...map.values()].sort((a, b) => a.timestamp.localeCompare(b.timestamp));
}

function windowYears(window: SeasonalityWindow) { return window === "MAX" ? null : Number(window.slice(0, -1)); }

export function analyzeSeasonality(symbol: string, input: MarketChartPoint[], window: SeasonalityWindow, provider: string): SeasonalityAnalysis {
  const all = normalize(input);
  if (all.length < 2) throw new Error("INSUFFICIENT_SEASONALITY_DATA");
  const latestDate = new Date(all.at(-1)!.timestamp); const yearsRequested = windowYears(window);
  const cutoff = yearsRequested === null ? null : new Date(Date.UTC(latestDate.getUTCFullYear() - yearsRequested, latestDate.getUTCMonth(), latestDate.getUTCDate()));
  const bars = cutoff ? all.filter((point) => new Date(point.timestamp) >= cutoff) : all;
  const yearSet = new Set(bars.map((point) => new Date(point.timestamp).getUTCFullYear())); const availableYears = yearSet.size; const descriptiveOnly = window === "1Y" || availableYears < 2;
  const weekdayObservations: Observation[] = []; const weekObservations: Observation[] = []; const dayObservations: Observation[] = []; const progressObservations: Observation[] = [];
  const barsByYear = new Map<number, MarketChartPoint[]>();
  for (const bar of bars) { const year = new Date(bar.timestamp).getUTCFullYear(); const list = barsByYear.get(year) ?? []; list.push(bar); barsByYear.set(year, list); }
  for (let index = 1; index < bars.length; index += 1) {
    const previous = bars[index - 1].adjustedClose ?? bars[index - 1].close; const current = bars[index].adjustedClose ?? bars[index].close; const value = (current / previous - 1) * 100; const date = new Date(bars[index].timestamp); const yearBars = barsByYear.get(date.getUTCFullYear()) ?? []; const yearIndex = yearBars.findIndex((bar) => bar.timestamp === bars[index].timestamp); const progress = yearBars.length <= 1 ? 1 : Math.min(10, Math.floor(yearIndex / yearBars.length * 10) + 1);
    weekdayObservations.push({ key: date.getUTCDay(), value, sequence: index }); weekObservations.push({ key: weekOfYear(date), value, sequence: index }); dayObservations.push({ key: date.getUTCDate(), value, sequence: index }); progressObservations.push({ key: progress, value, sequence: index });
  }
  const monthGroups = new Map<string, MarketChartPoint[]>();
  for (const bar of bars) { const date = new Date(bar.timestamp); const key = `${date.getUTCFullYear()}-${date.getUTCMonth()}`; const list = monthGroups.get(key) ?? []; list.push(bar); monthGroups.set(key, list); }
  const monthlyObservations: Observation[] = [...monthGroups.entries()].flatMap(([key, group], sequence) => {
    if (group.length < 2) return [];
    const first = group[0].adjustedClose ?? group[0].close; const last = group.at(-1)!.adjustedClose ?? group.at(-1)!.close;
    return [{ key: Number(key.split("-")[1]) + 1, value: (last / first - 1) * 100, sequence }];
  });
  const annualReturns = [...barsByYear.values()].flatMap((group) => group.length < 2 ? [] : [((group.at(-1)!.adjustedClose ?? group.at(-1)!.close) / (group[0].adjustedClose ?? group[0].close) - 1) * 100]);
  const currentYear = latestDate.getUTCFullYear(); const currentYearMonthlyReturns = Object.fromEntries(monthlyObservations.filter((item) => [...monthGroups.keys()][item.sequence]?.startsWith(`${currentYear}-`)).map((item) => [item.key, item.value]));
  const buckets = (observations: Observation[], keys: number[], label: (key: number) => string) => keys.map((key) => summarize(key, label(key), observations.filter((item) => item.key === key), availableYears, descriptiveOnly));
  const monthly = buckets(monthlyObservations, Array.from({ length: 12 }, (_, index) => index + 1), (key) => MONTHS[key - 1]);
  const qualityCounts = monthly.reduce<Record<SeasonalityQuality, number>>((acc, item) => { acc[item.quality] += 1; return acc; }, { INSUFFICIENT: 0, LOW: 0, MEDIUM: 0, HIGH: 0 });
  const quality: SeasonalityQuality = descriptiveOnly ? "INSUFFICIENT" : qualityCounts.HIGH >= 6 ? "HIGH" : qualityCounts.MEDIUM + qualityCounts.HIGH >= 6 ? "MEDIUM" : qualityCounts.LOW > 0 ? "LOW" : "INSUFFICIENT";
  return { symbol, window, availableYears, observations: bars.length, calculatedAt: new Date().toISOString(), dataTimestamp: bars.at(-1)!.timestamp, modelVersion: SEASONALITY_MODEL_VERSION, provider, quality, descriptiveOnly, monthly, weekday: buckets(weekdayObservations, [1, 2, 3, 4, 5], (key) => WEEKDAYS[key]), weekOfYear: buckets(weekObservations, Array.from({ length: 53 }, (_, index) => index + 1), (key) => `W${key}`), dayOfMonth: buckets(dayObservations, Array.from({ length: 31 }, (_, index) => index + 1), String), tradingProgress: buckets(progressObservations, Array.from({ length: 10 }, (_, index) => index + 1), (key) => `${(key - 1) * 10}–${key * 10}%`), annualReturns, currentYearMonthlyReturns, disclaimer: "Historical seasonality is descriptive, not a guarantee or investment recommendation." };
}
