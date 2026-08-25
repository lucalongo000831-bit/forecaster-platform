import type { BollingerSeries, MacdSeries, MarketChartPoint, TechnicalPricePolicy, TechnicalTimeframe } from "@/types";
import { exponentialMovingAverage, relativeStrengthIndex, averageTrueRange, simpleMovingAverage } from "./indicators";

const HOUR_MS = 3_600_000;

function finite(value: number) { return Number.isFinite(value); }

export function sanitizeTechnicalBars(input: MarketChartPoint[]): MarketChartPoint[] {
  const unique = new Map<number, MarketChartPoint>();
  for (const bar of input) {
    const timestamp = Date.parse(bar.timestamp);
    if (!Number.isFinite(timestamp) || ![bar.open, bar.high, bar.low, bar.close, bar.volume].every(finite)) continue;
    if (bar.open <= 0 || bar.high <= 0 || bar.low <= 0 || bar.close <= 0 || bar.volume < 0) continue;
    if (bar.high < Math.max(bar.open, bar.close) || bar.low > Math.min(bar.open, bar.close) || bar.low > bar.high) continue;
    unique.set(timestamp, { ...bar, timestamp: new Date(timestamp).toISOString() });
  }
  return [...unique.entries()].sort(([left], [right]) => left - right).map(([, bar]) => bar);
}

export function applyCanonicalPricePolicy(input: MarketChartPoint[], assetClass: string): { bars: MarketChartPoint[]; policy: TechnicalPricePolicy } {
  const clean = sanitizeTechnicalBars(input);
  if (assetClass === "CRYPTO") return { bars: clean.map((bar) => ({ timestamp: bar.timestamp, open: bar.open, high: bar.high, low: bar.low, close: bar.close, volume: bar.volume })), policy: "RAW_OHLC" };
  const hasAdjustment = clean.length > 0 && clean.every((bar) => typeof bar.adjustedClose === "number" && finite(bar.adjustedClose) && bar.adjustedClose > 0);
  if (!hasAdjustment) return { bars: clean, policy: "RAW_OHLC" };
  return {
    policy: "ADJUSTED_OHLC",
    bars: clean.map((bar) => {
      if (typeof bar.adjustedClose !== "number" || !finite(bar.adjustedClose) || bar.adjustedClose <= 0 || bar.close <= 0) return bar;
      const ratio = bar.adjustedClose / bar.close;
      return { ...bar, open: bar.open * ratio, high: bar.high * ratio, low: bar.low * ratio, close: bar.adjustedClose };
    }),
  };
}

export function resampleFourHourBars(input: MarketChartPoint[]): MarketChartPoint[] {
  const clean = sanitizeTechnicalBars(input);
  const groups = new Map<number, MarketChartPoint[]>();
  for (const bar of clean) {
    const time = Date.parse(bar.timestamp);
    const bucket = Math.floor(time / (4 * HOUR_MS)) * 4 * HOUR_MS;
    const group = groups.get(bucket) ?? [];
    group.push(bar);
    groups.set(bucket, group);
  }
  return [...groups.entries()].flatMap(([timestamp, bars]) => {
    const distinctHours = new Set(bars.map((bar) => Math.floor(Date.parse(bar.timestamp) / HOUR_MS)));
    const times = bars.map((bar) => Date.parse(bar.timestamp));
    const contiguous = times.every((time, index) => index === 0 || time - times[index - 1] === HOUR_MS);
    if (bars.length !== 4 || distinctHours.size !== 4 || !contiguous) return [];
    return [{
      timestamp: new Date(timestamp).toISOString(),
      open: bars[0].open,
      high: Math.max(...bars.map((bar) => bar.high)),
      low: Math.min(...bars.map((bar) => bar.low)),
      close: bars.at(-1)!.close,
      adjustedClose: bars.at(-1)!.adjustedClose,
      volume: bars.reduce((sum, bar) => sum + bar.volume, 0),
    }];
  });
}

function populationDeviation(values: number[]) {
  const average = values.reduce((sum, value) => sum + value, 0) / values.length;
  return Math.sqrt(values.reduce((sum, value) => sum + (value - average) ** 2, 0) / values.length);
}

export function bollingerBands(values: number[], period = 20, deviations = 2): BollingerSeries {
  const middle = simpleMovingAverage(values, period);
  const upper = Array<number | null>(values.length).fill(null);
  const lower = Array<number | null>(values.length).fill(null);
  if (!Number.isInteger(period) || period <= 0 || period > 10_000 || !finite(deviations) || deviations <= 0) return { middle, upper, lower };
  for (let index = period - 1; index < values.length; index += 1) {
    const deviation = populationDeviation(values.slice(index - period + 1, index + 1));
    upper[index] = (middle[index] as number) + deviations * deviation;
    lower[index] = (middle[index] as number) - deviations * deviation;
  }
  return { middle, upper, lower };
}

function emaNullable(values: Array<number | null>, period: number) {
  const result = Array<number | null>(values.length).fill(null);
  const start = values.findIndex((value) => value !== null);
  if (start < 0) return result;
  const compact = values.slice(start).filter((value): value is number => value !== null);
  const calculated = exponentialMovingAverage(compact, period);
  calculated.forEach((value, index) => { result[start + index] = value; });
  return result;
}

export function movingAverageConvergenceDivergence(values: number[], fast = 12, slow = 26, signalPeriod = 9): MacdSeries {
  if (![fast, slow, signalPeriod].every((period) => Number.isInteger(period) && period > 0 && period <= 10_000) || fast >= slow) {
    const empty = () => Array<number | null>(values.length).fill(null);
    return { macd: empty(), signal: empty(), histogram: empty() };
  }
  const fastSeries = exponentialMovingAverage(values, fast);
  const slowSeries = exponentialMovingAverage(values, slow);
  const macd = values.map((_, index) => fastSeries[index] === null || slowSeries[index] === null ? null : (fastSeries[index] as number) - (slowSeries[index] as number));
  const signal = emaNullable(macd, signalPeriod);
  const histogram = macd.map((value, index) => value === null || signal[index] === null ? null : value - (signal[index] as number));
  return { macd, signal, histogram };
}

export function volumeWeightedAveragePrice(bars: MarketChartPoint[], reset: "UTC_DAY" | "CONTINUOUS" = "UTC_DAY"): Array<number | null> {
  let cumulativePriceVolume = 0;
  let cumulativeVolume = 0;
  let session = "";
  return bars.map((bar) => {
    const nextSession = bar.timestamp.slice(0, 10);
    if (reset === "UTC_DAY" && nextSession !== session) {
      cumulativePriceVolume = 0;
      cumulativeVolume = 0;
      session = nextSession;
    }
    if (bar.volume <= 0) return null;
    cumulativePriceVolume += ((bar.high + bar.low + bar.close) / 3) * bar.volume;
    cumulativeVolume += bar.volume;
    return cumulativeVolume > 0 ? cumulativePriceVolume / cumulativeVolume : null;
  });
}

export function normalizedComparison(values: number[]) {
  const base = values.find((value) => finite(value) && value > 0);
  return base ? values.map((value) => (value / base - 1) * 100) : values.map(() => null);
}

export function normalizeSeriesAtCommonStart(series: Array<Array<{ timestamp: string; value: number }>>): Array<Array<number | null>> {
  if (!series.length || series.some((rows) => rows.length === 0)) return series.map((rows) => rows.map(() => null));
  const commonStart = Math.max(...series.map((rows) => Date.parse(rows[0].timestamp)));
  return series.map((rows) => {
    const baseIndex = rows.findIndex((row) => Date.parse(row.timestamp) >= commonStart && finite(row.value) && row.value > 0);
    if (baseIndex < 0) return rows.map(() => null);
    const base = rows[baseIndex].value;
    return rows.map((row, index) => index < baseIndex || !finite(row.value) ? null : (row.value / base - 1) * 100);
  });
}

export function calculateIndicatorSeries(bars: MarketChartPoint[]) {
  const closes = bars.map((bar) => bar.close);
  return {
    sma: (period: number) => simpleMovingAverage(closes, period),
    ema: (period: number) => exponentialMovingAverage(closes, period),
    bollinger: (period = 20, deviations = 2) => bollingerBands(closes, period, deviations),
    rsi: (period = 14) => relativeStrengthIndex(closes, period),
    macd: (fast = 12, slow = 26, signal = 9) => movingAverageConvergenceDivergence(closes, fast, slow, signal),
    atr: (period = 14) => averageTrueRange(bars, period),
    vwap: () => volumeWeightedAveragePrice(bars),
  };
}

export const TECHNICAL_TIMEFRAMES: TechnicalTimeframe[] = ["1m", "5m", "15m", "30m", "1h", "4h", "1D", "1W"];
