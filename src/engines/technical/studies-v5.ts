import type { MarketChartPoint, TechnicalIndicatorConfig } from "@/types";
import { averageTrueRange, exponentialMovingAverage, simpleMovingAverage } from "./indicators";

export function smoothedMovingAverage(values: number[], period: number): Array<number | null> {
  const result = Array<number | null>(values.length).fill(null);
  if (!Number.isInteger(period) || period < 1 || period > 10_000 || values.length < period) return result;
  result[period - 1] = values.slice(0, period).reduce((sum, value) => sum + value, 0) / period;
  for (let index = period; index < values.length; index++) result[index] = (result[index - 1]! * (period - 1) + values[index]) / period;
  return result;
}
export function indicatorPrice(bar: MarketChartPoint, source: TechnicalIndicatorConfig["source"] = "close") {
  return source === "hl2" ? (bar.high + bar.low) / 2 : source === "hlc3" ? (bar.high + bar.low + bar.close) / 3 : source === "ohlc4" ? (bar.open + bar.high + bar.low + bar.close) / 4 : bar[source];
}
export function supertrend(bars: MarketChartPoint[], period = 10, multiplier = 3) {
  const atr = averageTrueRange(bars, period);
  const line = Array<number | null>(bars.length).fill(null);
  const bullish = [...line]; const bearish = [...line];
  const direction = Array<1 | -1 | null>(bars.length).fill(null);
  let upper = 0; let lower = 0; let trend: 1 | -1 = 1;
  for (let index = 0; index < bars.length; index++) {
    if (atr[index] === null) continue;
    const middle = (bars[index].high + bars[index].low) / 2;
    const basicUpper = middle + multiplier * atr[index]!; const basicLower = middle - multiplier * atr[index]!;
    if (line[index - 1] === undefined || line[index - 1] === null) { upper = basicUpper; lower = basicLower; trend = bars[index].close >= middle ? 1 : -1; }
    else {
      const oldUpper = upper; const oldLower = lower;
      upper = basicUpper < oldUpper || bars[index - 1].close > oldUpper ? basicUpper : oldUpper;
      lower = basicLower > oldLower || bars[index - 1].close < oldLower ? basicLower : oldLower;
      trend = trend === -1 ? bars[index].close > upper ? 1 : -1 : bars[index].close < lower ? -1 : 1;
    }
    direction[index] = trend; line[index] = trend === 1 ? lower : upper;
    if (trend === 1) bullish[index] = line[index]; else bearish[index] = line[index];
  }
  return { line, bullish, bearish, direction };
}
export function directionalMovement(bars: MarketChartPoint[], period = 14) {
  const positive = Array<number | null>(bars.length).fill(null); const negative = [...positive]; const adx = [...positive]; const dx = [...positive];
  if (!Number.isInteger(period) || period < 2 || bars.length <= period) return { adx, positive, negative };
  let tr = 0; let plus = 0; let minus = 0; let dxSeed = 0;
  for (let index = 1; index < bars.length; index++) {
    const up = bars[index].high - bars[index - 1].high; const down = bars[index - 1].low - bars[index].low;
    const nextPlus = up > down && up > 0 ? up : 0; const nextMinus = down > up && down > 0 ? down : 0;
    const nextTr = Math.max(bars[index].high - bars[index].low, Math.abs(bars[index].high - bars[index - 1].close), Math.abs(bars[index].low - bars[index - 1].close));
    if (index <= period) { tr += nextTr; plus += nextPlus; minus += nextMinus; }
    else { tr = tr - tr / period + nextTr; plus = plus - plus / period + nextPlus; minus = minus - minus / period + nextMinus; }
    if (index < period) continue;
    positive[index] = tr ? 100 * plus / tr : 0; negative[index] = tr ? 100 * minus / tr : 0;
    const sum = positive[index]! + negative[index]!;
    dx[index] = sum ? 100 * Math.abs(positive[index]! - negative[index]!) / sum : 0;
    if (index < 2 * period) dxSeed += dx[index]!;
    if (index === 2 * period - 1) adx[index] = dxSeed / period;
    else if (index >= 2 * period) adx[index] = (adx[index - 1]! * (period - 1) + dx[index]!) / period;
  }
  return { adx, positive, negative };
}
export function donchianChannels(bars: MarketChartPoint[], period = 20) {
  const upper = Array<number | null>(bars.length).fill(null); const lower = [...upper]; const middle = [...upper];
  if (!Number.isInteger(period) || period < 1 || period > 10_000) return { upper, lower, middle };
  // Monotonic queues provide O(n) channel calculation even on MAX histories.
  const highs: number[] = []; const lows: number[] = []; let highHead = 0; let lowHead = 0;
  for (let index = 0; index < bars.length; index++) {
    while (highs.length > highHead && bars[highs.at(-1)!].high <= bars[index].high) highs.pop();
    while (lows.length > lowHead && bars[lows.at(-1)!].low >= bars[index].low) lows.pop();
    highs.push(index); lows.push(index);
    while (highHead < highs.length && highs[highHead] <= index - period) highHead++;
    while (lowHead < lows.length && lows[lowHead] <= index - period) lowHead++;
    if (index >= period - 1) { upper[index] = bars[highs[highHead]].high; lower[index] = bars[lows[lowHead]].low; middle[index] = (upper[index]! + lower[index]!) / 2; }
  }
  return { upper, lower, middle };
}
export function atrTrailingStop(bars: MarketChartPoint[], period = 14, multiplier = 3, mode: "LONG" | "SHORT" | "AUTO" = "AUTO") {
  if (mode === "AUTO") return supertrend(bars, period, multiplier).line;
  const atr = averageTrueRange(bars, period); let previous: number | null = null;
  return bars.map((bar, index) => {
    if (atr[index] === null) return null;
    const candidate = bar.close + (mode === "LONG" ? -1 : 1) * multiplier * atr[index]!;
    previous = previous === null ? candidate : mode === "LONG" ? Math.max(previous, candidate) : Math.min(previous, candidate);
    return previous;
  });
}

/** Calculate on pre-roll + visible history, then align by timestamp. */
export function movingAverageOnVisibleHistory(calculationBars: MarketChartPoint[], visibleBars: MarketChartPoint[], config: TechnicalIndicatorConfig) {
  const prices = calculationBars.map((bar) => indicatorPrice(bar, config.source));
  const period = config.period ?? 20;
  const values = config.kind === "SMA" ? simpleMovingAverage(prices, period) : config.kind === "SMMA" ? smoothedMovingAverage(prices, period) : exponentialMovingAverage(prices, period);
  const byTime = new Map(calculationBars.map((bar, index) => [bar.timestamp, values[index]]));
  return visibleBars.map((bar) => byTime.get(bar.timestamp) ?? null);
}
