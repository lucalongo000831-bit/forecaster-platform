import type { MarketChartPoint } from "@/types";
import { clamp, mean, median, percentile, sampleStandardDeviation } from "../shared/statistics";
import {
  PRESIDENTIAL_CYCLES,
  SEASONALITY_HISTORICAL_WINDOWS,
  SEASONALITY_MODEL_VERSION,
  type AdjustedSeasonalityBar,
  type PresidentialCycle,
  type SeasonalityAnalysis,
  type SeasonalityAssetClass,
  type SeasonalityBucket,
  type SeasonalityCorrelation,
  type SeasonalityCurve,
  type SeasonalityCurvePoint,
  type SeasonalityDirectionalBucket,
  type SeasonalityDirectionalSeries,
  type SeasonalityEngineOptions,
  type SeasonalityHistoricalWindow,
  type SeasonalityMonthlyCell,
  type SeasonalityQuality,
  type SeasonalityRangeStats,
  type SeasonalitySide,
  type SeasonalityTradeObservation,
} from "./types";

const GRID_POINTS = 1_000;
const MIN_CORRELATION_POINTS = 40;
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const CYCLE_LABELS: Record<PresidentialCycle, string> = {
  POST_ELECTION: "Post-election year",
  MIDTERM: "Midterm year",
  PRE_ELECTION: "Pre-election year",
  ELECTION: "Election year",
};

interface Observation { key: number; value: number; sequence: number; year: number }
interface YearCurve { year: number; points: SeasonalityCurvePoint[]; bars: AdjustedSeasonalityBar[] }

function finitePositive(value: number | null | undefined): value is number {
  return typeof value === "number" && Number.isFinite(value) && value > 0;
}

function dateKey(date: Date) {
  return date.toISOString().slice(0, 10);
}

function normalCdf(value: number) {
  const sign = value < 0 ? -1 : 1;
  const x = Math.abs(value) / Math.sqrt(2);
  const t = 1 / (1 + 0.3275911 * x);
  const erf = 1 - (((((1.061405429 * t - 1.453152027) * t) + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t * Math.exp(-x * x);
  return 0.5 * (1 + sign * erf);
}

function qualityFor(sampleSize: number, years: number): SeasonalityQuality {
  if (sampleSize < 2 || years < 2) return "INSUFFICIENT";
  if (sampleSize < 5 || years < 5) return "LOW";
  if (sampleSize < 10 || years < 10) return "MEDIUM";
  return "HIGH";
}

function completeness(actual: number, expected: number) {
  return expected <= 0 ? 0 : clamp(actual / expected * 100, 0, 100);
}

function rounded(value: number, digits = 4) {
  return Number(value.toFixed(digits));
}

export function normalizeSeasonalityBars(input: MarketChartPoint[], assetClass: SeasonalityAssetClass = "EQUITY"): AdjustedSeasonalityBar[] {
  const unique = new Map<string, AdjustedSeasonalityBar>();
  for (const point of input) {
    const parsed = new Date(point.timestamp);
    if (!Number.isFinite(parsed.getTime()) || !finitePositive(point.close)) continue;
    const date = dateKey(parsed);
    const factor = assetClass === "CRYPTO" || !finitePositive(point.adjustedClose) ? 1 : point.adjustedClose / point.close;
    const open = finitePositive(point.open) ? point.open : point.close;
    const high = finitePositive(point.high) ? point.high : Math.max(open, point.close);
    const low = finitePositive(point.low) ? point.low : Math.min(open, point.close);
    if (![factor, open, high, low].every(Number.isFinite) || factor <= 0) continue;
    unique.set(date, {
      timestamp: point.timestamp,
      date,
      year: parsed.getUTCFullYear(),
      month: parsed.getUTCMonth() + 1,
      day: parsed.getUTCDate(),
      weekday: parsed.getUTCDay(),
      open,
      high,
      low,
      close: point.close,
      adjustedOpen: open * factor,
      adjustedHigh: high * factor,
      adjustedLow: low * factor,
      adjustedClose: point.close * factor,
      adjustmentFactor: factor,
      volume: Number.isFinite(point.volume) ? point.volume : 0,
    });
  }
  return [...unique.values()].sort((a, b) => a.date.localeCompare(b.date));
}

function fnv1a(value: string) {
  let hash = 0x811c9dc5;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
}

export function seasonalityHistoryHash(bars: AdjustedSeasonalityBar[]) {
  return fnv1a(bars.map((bar) => `${bar.date}:${bar.adjustedOpen.toFixed(6)}:${bar.adjustedHigh.toFixed(6)}:${bar.adjustedLow.toFixed(6)}:${bar.adjustedClose.toFixed(6)}`).join("|"));
}

export function seasonalityConfigurationHash(options: SeasonalityEngineOptions) {
  return fnv1a(JSON.stringify({
    engineConfiguration: "grid1000-round4-hit-rate-v2",
    windows: options.windows,
    selectedMonth: options.selectedMonth,
    rangeStart: options.rangeStart,
    rangeEnd: options.rangeEnd,
    side: options.side,
    includeCycles: options.includeCycles,
    includeCorrelations: options.includeCorrelations,
    includeTradeStats: options.includeTradeStats,
    includeTable: options.includeTable,
    assetClass: options.assetClass,
  }));
}

function interpolate(values: number[], outputPoints = GRID_POINTS): number[] {
  if (!values.length || outputPoints <= 0) return [];
  if (values.length === 1) return Array.from({ length: outputPoints }, () => values[0]);
  return Array.from({ length: outputPoints }, (_, index) => {
    const position = index / Math.max(1, outputPoints - 1) * (values.length - 1);
    const lower = Math.floor(position);
    const upper = Math.min(values.length - 1, Math.ceil(position));
    const weight = position - lower;
    return values[lower] + (values[upper] - values[lower]) * weight;
  });
}

function progressLabel(progress: number) {
  const month = Math.min(11, Math.floor(progress * 12));
  return MONTHS[month];
}

function curveFromBars(bars: AdjustedSeasonalityBar[]): SeasonalityCurvePoint[] {
  if (bars.length < 2 || !finitePositive(bars[0].adjustedClose)) return [];
  const base = bars[0].adjustedClose;
  return interpolate(bars.map((bar) => (bar.adjustedClose / base - 1) * 100)).map((value, index) => {
    const progress = rounded(index / (GRID_POINTS - 1));
    return { progress, value: rounded(value), label: progressLabel(progress) };
  });
}

function currentCurveFromBars(bars: AdjustedSeasonalityBar[], currentYear: number, assetClass: SeasonalityAssetClass): SeasonalityCurvePoint[] {
  if (bars.length < 2) return [];
  const base = bars[0].adjustedClose;
  const daysInYear = Date.UTC(currentYear + 1, 0, 1) - Date.UTC(currentYear, 0, 1);
  const last = bars.at(-1)!;
  const endProgress = assetClass === "CRYPTO"
    ? clamp((Date.parse(`${last.date}T00:00:00Z`) - Date.UTC(currentYear, 0, 1)) / daysInYear, 0, 1)
    : clamp(bars.length / 252, 0, 1);
  const count = Math.max(2, Math.floor(endProgress * (GRID_POINTS - 1)) + 1);
  return interpolate(bars.map((bar) => (bar.adjustedClose / base - 1) * 100), count).map((value, index) => {
    const progress = rounded(index / (GRID_POINTS - 1));
    return { progress, value: rounded(value), label: progressLabel(progress) };
  });
}

function averageCurve(yearCurves: YearCurve[], selector: (values: number[]) => number | null): { points: SeasonalityCurvePoint[]; medianPoints: SeasonalityCurvePoint[] } {
  if (!yearCurves.length) return { points: [], medianPoints: [] };
  const points = Array.from({ length: GRID_POINTS }, (_, index) => {
    const progress = rounded(index / (GRID_POINTS - 1));
    return { progress, value: rounded(selector(yearCurves.map((item) => item.points[index].value)) ?? 0), label: progressLabel(progress) };
  });
  const medianPoints = Array.from({ length: GRID_POINTS }, (_, index) => {
    const progress = rounded(index / (GRID_POINTS - 1));
    return { progress, value: rounded(median(yearCurves.map((item) => item.points[index].value)) ?? 0), label: progressLabel(progress) };
  });
  return { points, medianPoints };
}

function windowCount(window: SeasonalityHistoricalWindow) {
  return window === "MAX" ? null : Number.parseInt(window, 10);
}

function pearson(left: number[], right: number[]): SeasonalityCorrelation {
  const sampleSize = Math.min(left.length, right.length);
  const quality: SeasonalityQuality = sampleSize < MIN_CORRELATION_POINTS ? "INSUFFICIENT" : sampleSize < 100 ? "LOW" : sampleSize < 200 ? "MEDIUM" : "HIGH";
  const dataCompleteness = completeness(sampleSize, GRID_POINTS);
  if (sampleSize < MIN_CORRELATION_POINTS) return { rawCorrelation: null, correlationScore: null, sampleSize, quality, dataCompleteness, status: sampleSize ? "INSUFFICIENT_SAMPLE" : "CURRENT_YEAR_UNAVAILABLE" };
  const a = left.slice(0, sampleSize);
  const b = right.slice(0, sampleSize);
  const aMean = mean(a) ?? 0;
  const bMean = mean(b) ?? 0;
  let numerator = 0; let aSquares = 0; let bSquares = 0;
  for (let index = 0; index < sampleSize; index += 1) {
    const av = a[index] - aMean; const bv = b[index] - bMean;
    numerator += av * bv; aSquares += av * av; bSquares += bv * bv;
  }
  const denominator = Math.sqrt(aSquares * bSquares);
  const rawCorrelation = denominator > 0 ? clamp(numerator / denominator, -1, 1) : null;
  return { rawCorrelation, correlationScore: rawCorrelation === null ? null : Math.max(0, rawCorrelation) * 100, sampleSize, quality, dataCompleteness, status: rawCorrelation === null ? "INSUFFICIENT_SAMPLE" : "AVAILABLE" };
}

export function presidentialCycleForYear(year: number): PresidentialCycle {
  const remainder = ((year % 4) + 4) % 4;
  if (remainder === 0) return "ELECTION";
  if (remainder === 1) return "POST_ELECTION";
  if (remainder === 2) return "MIDTERM";
  return "PRE_ELECTION";
}

function summarize(key: number, label: string, observations: Observation[], years: number): SeasonalityBucket {
  const values = observations.map((item) => item.value).filter(Number.isFinite);
  const average = mean(values); const deviation = sampleStandardDeviation(values); const med = median(values);
  const standardError = deviation === null || !values.length ? null : deviation / Math.sqrt(values.length);
  const midpoint = Math.floor(observations.length / 2);
  const firstMean = mean(observations.slice(0, midpoint).map((item) => item.value));
  const secondMean = mean(observations.slice(midpoint).map((item) => item.value));
  const stability = firstMean === null || secondMean === null || deviation === null || deviation === 0 ? null : clamp(100 - Math.abs(firstMean - secondMean) / deviation * 25, 0, 100);
  const z = average === null || standardError === null || standardError === 0 || values.length < 5 ? null : average / standardError;
  return { key, label, mean: average, median: med, hitRate: values.length ? values.filter((value) => value > 0).length / values.length * 100 : null, standardDeviation: deviation, percentile10: percentile(values, 0.1), percentile25: percentile(values, 0.25), percentile50: med, percentile75: percentile(values, 0.75), percentile90: percentile(values, 0.9), best: values.length ? Math.max(...values) : null, worst: values.length ? Math.min(...values) : null, observations: values.length, confidenceLow: average === null || standardError === null ? null : average - 1.96 * standardError, confidenceHigh: average === null || standardError === null ? null : average + 1.96 * standardError, pValue: z === null ? null : 2 * (1 - normalCdf(Math.abs(z))), stability, quality: qualityFor(values.length, years) };
}

function monthReturn(group: AdjustedSeasonalityBar[]) {
  if (group.length < 2 || !finitePositive(group[0].adjustedOpen)) return null;
  return (group.at(-1)!.adjustedClose / group[0].adjustedOpen - 1) * 100;
}

export function signedDirectionalScore(values: number[]) {
  if (!values.length) return null;
  const hitRate = values.filter((value) => value > 0).length / values.length;
  if (hitRate === 0.5) return 0;
  return hitRate > 0.5 ? hitRate * 100 : -(1 - hitRate) * 100;
}

function directionalBucket(key: number, label: string, observations: Observation[], expectedYears: number): SeasonalityDirectionalBucket {
  const values = observations.map((item) => item.value);
  const years = [...new Set(observations.map((item) => item.year))].sort((a, b) => a - b);
  return { key, label, score: signedDirectionalScore(values), meanReturn: mean(values), positiveHitRate: values.length ? values.filter((value) => value > 0).length / values.length * 100 : null, sampleSize: values.length, years, quality: qualityFor(values.length, years.length), dataCompleteness: completeness(years.length, expectedYears) };
}

function directionalSeries(id: string, label: string, observations: Observation[], keys: number[], labels: (key: number) => string, expectedYears: number): SeasonalityDirectionalSeries {
  const buckets = keys.map((key) => directionalBucket(key, labels(key), observations.filter((item) => item.key === key), expectedYears));
  return { seriesId: id, label, status: buckets.some((item) => item.sampleSize > 0) ? "AVAILABLE" : "INSUFFICIENT_SAMPLE", buckets };
}

function mmdd(value: string) {
  const match = /^(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/.exec(value);
  if (!match) throw new Error("INVALID_SEASONALITY_RANGE");
  const test = new Date(`2024-${value}T00:00:00Z`);
  if (dateKey(test).slice(5) !== value) throw new Error("INVALID_SEASONALITY_RANGE");
  return value;
}

function tradeForYear(bars: AdjustedSeasonalityBar[], year: number, start: string, end: string, side: SeasonalitySide): SeasonalityTradeObservation | null {
  const crossesYear = end < start;
  const startKey = `${year}-${start}`;
  const endKey = `${year + (crossesYear ? 1 : 0)}-${end}`;
  const period = bars.filter((bar) => bar.date >= startKey && bar.date <= endKey);
  if (period.length < 2 || period[0].date.slice(0, 4) !== String(year)) return null;
  const openPrice = period[0].adjustedOpen;
  const closePrice = period.at(-1)!.adjustedClose;
  if (!finitePositive(openPrice) || !finitePositive(closePrice)) return null;
  const direction = side === "LONG" ? 1 : -1;
  const rawReturn = (closePrice / openPrice - 1) * 100;
  const rawChanges = period.flatMap((bar) => [(bar.adjustedHigh / openPrice - 1) * 100, (bar.adjustedLow / openPrice - 1) * 100]);
  const directed = rawChanges.map((value) => value * direction);
  const maxRisePct = Math.max(...rawChanges);
  const maxDropPct = Math.min(...rawChanges);
  return { year, openDate: period[0].date, closeDate: period.at(-1)!.date, openPrice, closePrice, returnPct: rawReturn * direction, maxDropPct, maxRisePct, maxFavorableExcursionPct: Math.max(...directed), maxAdverseExcursionPct: Math.min(...directed), openPriceSource: "ADJUSTED_OPEN" };
}

function summarizeTrades(seriesId: string, label: string, trades: SeasonalityTradeObservation[], expectedYears = trades.length): SeasonalityRangeStats {
  const returns = trades.map((trade) => trade.returnPct);
  const years = trades.map((trade) => trade.year);
  return { seriesId, label, status: trades.length ? "AVAILABLE" : "INSUFFICIENT_SAMPLE", probability: trades.length ? returns.filter((value) => value > 0).length / trades.length * 100 : null, averageReturn: mean(returns), medianReturn: median(returns), bestReturn: returns.length ? Math.max(...returns) : null, worstReturn: returns.length ? Math.min(...returns) : null, avgMaxRise: mean(trades.map((trade) => trade.maxRisePct)), avgMaxDrop: mean(trades.map((trade) => trade.maxDropPct)), observations: trades.length, years, quality: qualityFor(trades.length, trades.length), dataCompleteness: completeness(trades.length, expectedYears), trades };
}

function makeCurve(id: string, label: string, type: SeasonalityCurve["type"], selected: YearCurve[], expectedYears: number | null, correlation: SeasonalityCorrelation | null, extra: Partial<SeasonalityCurve> = {}): SeasonalityCurve {
  const available = selected.length > 0 && (expectedYears === null ? selected.length >= 2 : selected.length >= expectedYears);
  const averaged = available ? averageCurve(selected, mean) : { points: [], medianPoints: [] };
  return { id, label, type, available, status: available ? "AVAILABLE" : "INSUFFICIENT_HISTORY", sampleYears: selected.map((item) => item.year), points: averaged.points, medianPoints: averaged.medianPoints, correlation, quality: qualityFor(selected.length, selected.length), dataCompleteness: expectedYears === null ? (selected.length >= 2 ? 100 : selected.length * 50) : completeness(selected.length, expectedYears), ...extra };
}

export function analyzeSeasonality(symbol: string, input: MarketChartPoint[], windowOrOptions: SeasonalityHistoricalWindow | SeasonalityEngineOptions = "20Y", provider = "unknown", source = "provider"): SeasonalityAnalysis {
  const options: SeasonalityEngineOptions = typeof windowOrOptions === "string" ? { windows: [windowOrOptions] } : windowOrOptions;
  const assetClass = options.assetClass ?? (symbol.toUpperCase().endsWith("-USD") ? "CRYPTO" : "EQUITY");
  const requestedWindows = [...new Set(options.windows?.length ? options.windows : SEASONALITY_HISTORICAL_WINDOWS)];
  const selectedMonth = clamp(Math.floor(options.selectedMonth ?? new Date().getUTCMonth() + 1), 1, 12);
  const now = options.now ?? new Date();
  const currentYear = now.getUTCFullYear();
  const bars = normalizeSeasonalityBars(input, assetClass).filter((bar) => bar.date <= dateKey(now));
  if (bars.length < 2) throw new Error("INSUFFICIENT_SEASONALITY_DATA");

  const barsByYear = new Map<number, AdjustedSeasonalityBar[]>();
  for (const bar of bars) { const group = barsByYear.get(bar.year) ?? []; group.push(bar); barsByYear.set(bar.year, group); }
  const completedYears = [...barsByYear.keys()].filter((year) => {
    if (year >= currentYear) return false;
    const group = barsByYear.get(year) ?? [];
    const minimumObservations = assetClass === "CRYPTO" ? 300 : 180;
    return group.length >= minimumObservations && group[0].month <= 2 && group.at(-1)!.month >= 11;
  }).sort((a, b) => a - b);
  const completedYearSet = new Set(completedYears);
  const yearCurves: YearCurve[] = completedYears.flatMap((year) => {
    const yearBars = barsByYear.get(year) ?? [];
    const points = curveFromBars(yearBars);
    return points.length ? [{ year, points, bars: yearBars }] : [];
  });
  const currentBars = barsByYear.get(currentYear) ?? [];
  const currentPoints = currentCurveFromBars(currentBars, currentYear, assetClass);
  const currentCurve: SeasonalityCurve = { id: "CURRENT", label: `${currentYear} YTD`, type: "CURRENT", available: currentPoints.length >= 2, status: currentPoints.length >= 2 ? "AVAILABLE" : "INSUFFICIENT_SAMPLE", year: currentYear, sampleYears: [currentYear], points: currentPoints, medianPoints: [], correlation: null, quality: "INSUFFICIENT", dataCompleteness: currentPoints.length / GRID_POINTS * 100 };

  const historicalCurves = requestedWindows.map((window) => {
    const expected = windowCount(window);
    const selected = expected === null ? yearCurves : yearCurves.slice(-expected);
    const provisional = makeCurve(window, `${window} historical average`, "HISTORICAL_WINDOW", selected, expected, null, { window });
    const correlation = options.includeCorrelations === false || !provisional.available ? null : pearson(currentPoints.map((point) => point.value), provisional.points.slice(0, currentPoints.length).map((point) => point.value));
    return { ...provisional, correlation };
  });

  const presidentialCycles = options.includeCycles === false ? [] : PRESIDENTIAL_CYCLES.map((cycle) => {
    const selected = yearCurves.filter((item) => presidentialCycleForYear(item.year) === cycle);
    const curve = makeCurve(`CYCLE_${cycle}`, CYCLE_LABELS[cycle], "PRESIDENTIAL_CYCLE", selected, null, null, { cycle });
    const correlation = options.includeCorrelations === false || !curve.available ? null : pearson(currentPoints.map((point) => point.value), curve.points.slice(0, currentPoints.length).map((point) => point.value));
    const withCorrelation = { ...curve, correlation };
    return { cycle, label: CYCLE_LABELS[cycle], sampleYears: selected.map((item) => item.year), curve: withCorrelation, quality: withCorrelation.quality };
  });

  const yearComparisons = options.includeCorrelations === false ? [] : yearCurves.map((item) => ({ item, correlation: pearson(currentPoints.map((point) => point.value), item.points.slice(0, currentPoints.length).map((point) => point.value)) })).filter((item) => item.correlation.status === "AVAILABLE" && item.correlation.rawCorrelation !== null).sort((a, b) => (b.correlation.rawCorrelation ?? -2) - (a.correlation.rawCorrelation ?? -2));
  const best = yearComparisons[0] ?? null;
  const bestCurve = best ? { id: `YEAR_${best.item.year}`, label: `Best analogue ${best.item.year}`, type: "BEST_CORRELATED_YEAR" as const, available: true, status: "AVAILABLE" as const, year: best.item.year, sampleYears: [best.item.year], points: best.item.points, medianPoints: [], correlation: best.correlation, quality: "INSUFFICIENT" as const, dataCompleteness: 100 } : null;

  const monthGroups = new Map<string, AdjustedSeasonalityBar[]>();
  for (const bar of bars) { const key = `${bar.year}-${String(bar.month).padStart(2, "0")}`; const group = monthGroups.get(key) ?? []; group.push(bar); monthGroups.set(key, group); }
  const monthlyObservations: Observation[] = [];
  const currentYearMonthlyReturns: Record<number, number> = {};
  for (const [key, group] of monthGroups) {
    const [yearValue, monthValue] = key.split("-").map(Number);
    const value = monthReturn(group);
    if (value === null) continue;
    if (yearValue === currentYear) currentYearMonthlyReturns[monthValue] = value;
    if (completedYearSet.has(yearValue)) monthlyObservations.push({ key: monthValue, value, sequence: monthlyObservations.length, year: yearValue });
  }

  const closeReturns: Observation[] = [];
  for (let index = 1; index < bars.length; index += 1) {
    const bar = bars[index]; const previous = bars[index - 1];
    if (bar.year !== previous.year) continue;
    closeReturns.push({ key: bar.day, value: (bar.adjustedClose / previous.adjustedClose - 1) * 100, sequence: index, year: bar.year });
  }
  const monthlyBuckets = Array.from({ length: 12 }, (_, index) => index + 1).map((key) => summarize(key, MONTHS[key - 1], monthlyObservations.filter((item) => item.key === key), completedYears.length));
  const weekday = [1, 2, 3, 4, 5, 6, 0].map((key) => summarize(key, WEEKDAYS[key], closeReturns.filter((item) => bars[item.sequence].weekday === key), completedYears.length));
  const weekOfYear = Array.from({ length: 53 }, (_, index) => index + 1).map((key) => summarize(key, `W${key}`, closeReturns.filter((item) => Math.floor((Date.parse(`${bars[item.sequence].date}T00:00:00Z`) - Date.UTC(bars[item.sequence].year, 0, 1)) / 604_800_000) + 1 === key), completedYears.length));
  const dayOfMonth = Array.from({ length: 31 }, (_, index) => index + 1).map((key) => summarize(key, String(key), closeReturns.filter((item) => item.key === key), completedYears.length));
  const tradingProgress = Array.from({ length: 10 }, (_, index) => index + 1).map((key) => summarize(key, `${(key - 1) * 10}–${key * 10}%`, closeReturns.filter((item) => {
    const group = barsByYear.get(item.year) ?? []; const position = group.findIndex((bar) => bar.date === bars[item.sequence].date);
    return Math.min(10, Math.floor(position / Math.max(1, group.length) * 10) + 1) === key;
  }), completedYears.length));

  const matrixRows = [...completedYears, ...(currentBars.length ? [currentYear] : [])].sort((a, b) => b - a).map((year) => ({ year, current: year === currentYear, cells: Array.from({ length: 12 }, (_, index): SeasonalityMonthlyCell => {
    const month = index + 1; const group = monthGroups.get(`${year}-${String(month).padStart(2, "0")}`) ?? []; const value = monthReturn(group);
    const isCurrentMonth = year === currentYear && month === now.getUTCMonth() + 1;
    if (value === null) return { month, returnPct: null, status: isCurrentMonth && group.length > 0 ? "IN_PROGRESS" : "MISSING" };
    return { month, returnPct: value, status: isCurrentMonth ? "IN_PROGRESS" : "COMPLETE" };
  }) }));
  const monthlyMatrix = options.includeTable === false ? null : { rows: matrixRows, summary: monthlyBuckets.map((bucket) => ({ month: bucket.key, probability: bucket.hitRate, averageReturn: bucket.mean, medianReturn: bucket.median, observations: bucket.observations, years: monthlyObservations.filter((item) => item.key === bucket.key).map((item) => item.year), quality: bucket.quality, dataCompleteness: completeness(bucket.observations, completedYears.length) })), methodology: "Monthly returns use adjusted first-session open to adjusted last-session close. The current incomplete month is shown but excluded from historical summaries." };

  const directionalForYears = (id: string, label: string, years: number[]) => {
    const allowed = new Set(years);
    const daily = closeReturns.filter((item) => allowed.has(item.year) && bars[item.sequence].month === selectedMonth).map((item) => ({ ...item, key: bars[item.sequence].day }));
    const weekly = closeReturns.filter((item) => allowed.has(item.year)).map((item) => ({ ...item, key: bars[item.sequence].weekday }));
    const monthly = monthlyObservations.filter((item) => allowed.has(item.year));
    const weekdayKeys = assetClass === "CRYPTO" ? [1, 2, 3, 4, 5, 6, 0] : [1, 2, 3, 4, 5];
    return {
      daily: directionalSeries(id, label, daily, Array.from({ length: 31 }, (_, index) => index + 1), String, years.length),
      weekly: directionalSeries(id, label, weekly, weekdayKeys, (key) => WEEKDAYS[key], years.length),
      monthly: directionalSeries(id, label, monthly, Array.from({ length: 12 }, (_, index) => index + 1), (key) => MONTHS[key - 1], years.length),
    };
  };
  const directionalInputs = [
    ...historicalCurves.filter((curve) => curve.available),
    ...presidentialCycles.map((item) => item.curve).filter((curve) => curve.available),
    ...(bestCurve ? [bestCurve] : []),
  ];
  const directionalSets = directionalInputs.map((curve) => directionalForYears(curve.id, curve.label, curve.sampleYears));

  let tradeRange = null;
  if (options.includeTradeStats !== false) {
    const start = mmdd(options.rangeStart ?? "01-01"); const end = mmdd(options.rangeEnd ?? "12-31"); const side = options.side ?? "LONG";
    const statistics = historicalCurves.map((curve) => {
      const summary = summarizeTrades(curve.id, curve.label, curve.sampleYears.flatMap((year) => { const trade = tradeForYear(bars, year, start, end, side); return trade ? [trade] : []; }), curve.sampleYears.length);
      return curve.available ? summary : { ...summary, status: curve.status, probability: null, averageReturn: null, medianReturn: null, bestReturn: null, worstReturn: null, avgMaxRise: null, avgMaxDrop: null, trades: [] };
    });
    for (const cycle of presidentialCycles) statistics.push(summarizeTrades(cycle.curve.id, cycle.label, cycle.sampleYears.flatMap((year) => { const trade = tradeForYear(bars, year, start, end, side); return trade ? [trade] : []; }), cycle.sampleYears.length));
    if (bestCurve?.year) { const trade = tradeForYear(bars, bestCurve.year, start, end, side); statistics.push(summarizeTrades(bestCurve.id, bestCurve.label, trade ? [trade] : [], 1)); }
    tradeRange = { rangeStart: start, rangeEnd: end, side, crossesYear: end < start, statistics };
  }

  const annualReturns = yearCurves.map((item) => item.points.at(-1)?.value ?? 0);
  const allSeries = [currentCurve, ...historicalCurves, ...presidentialCycles.map((item) => item.curve), ...(bestCurve ? [bestCurve] : [])];
  const correlations = allSeries.flatMap((curve) => curve.correlation ? [{ seriesId: curve.id, label: curve.label, correlation: curve.correlation }] : []);
  const overallQuality = qualityFor(completedYears.length, completedYears.length);
  return {
    symbol, assetClass, window: requestedWindows[0] ?? "20Y", windows: requestedWindows,
    availableYears: completedYears.length, observations: bars.length, calculatedAt: new Date().toISOString(), dataTimestamp: bars.at(-1)!.timestamp,
    modelVersion: SEASONALITY_MODEL_VERSION, provider, source, historyHash: seasonalityHistoryHash(bars), configurationHash: seasonalityConfigurationHash({ ...options, assetClass, windows: requestedWindows, selectedMonth }), quality: overallQuality, descriptiveOnly: completedYears.length < 2,
    availableHistory: { firstDate: bars[0].date, lastDate: bars.at(-1)!.date, currentYear, completedYears, availableYears: completedYears.length, observations: bars.length },
    curves: [currentCurve, ...historicalCurves], correlations,
    bestCorrelatedYear: { year: best?.item.year ?? null, correlation: best?.correlation ?? { rawCorrelation: null, correlationScore: null, sampleSize: currentPoints.length, quality: "INSUFFICIENT", dataCompleteness: completeness(currentPoints.length, GRID_POINTS), status: currentPoints.length ? "INSUFFICIENT_SAMPLE" : "CURRENT_YEAR_UNAVAILABLE" }, curve: bestCurve, note: "Only completed years are compared with the observed current-year segment; future points are never used." },
    presidentialCycles, tradeRange, monthlyMatrix,
    directional: { selectedMonth, daily: directionalSets.map((item) => item.daily), weekly: directionalSets.map((item) => item.weekly), monthly: directionalSets.map((item) => item.monthly) },
    monthly: monthlyBuckets, weekday, weekOfYear, dayOfMonth, tradingProgress, annualReturns, currentYearMonthlyReturns,
    disclaimer: "Historical seasonality is descriptive, not causal, not a guarantee and not an investment recommendation. Partial periods are excluded from historical averages.",
  };
}
