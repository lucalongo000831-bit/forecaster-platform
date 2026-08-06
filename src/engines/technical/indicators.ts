import type { MarketChartPoint } from "@/types";
import { clamp, mean, sampleStandardDeviation } from "../shared/statistics";

export function simpleMovingAverage(values: number[], period: number): Array<number | null> {
  const result = Array<number | null>(values.length).fill(null);
  if (period <= 0) return result;
  let sum = 0;
  for (let index = 0; index < values.length; index += 1) {
    sum += values[index];
    if (index >= period) sum -= values[index - period];
    if (index >= period - 1) result[index] = sum / period;
  }
  return result;
}

export function exponentialMovingAverage(values: number[], period: number): Array<number | null> {
  const result = Array<number | null>(values.length).fill(null);
  if (period <= 0 || values.length < period) return result;
  const seed = mean(values.slice(0, period));
  if (seed === null) return result;
  const alpha = 2 / (period + 1);
  result[period - 1] = seed;
  for (let index = period; index < values.length; index += 1) result[index] = alpha * values[index] + (1 - alpha) * (result[index - 1] as number);
  return result;
}

export function relativeStrengthIndex(values: number[], period = 14): Array<number | null> {
  const result = Array<number | null>(values.length).fill(null);
  if (values.length <= period) return result;
  let gains = 0; let losses = 0;
  for (let index = 1; index <= period; index += 1) {
    const change = values[index] - values[index - 1];
    gains += Math.max(change, 0); losses += Math.max(-change, 0);
  }
  let averageGain = gains / period; let averageLoss = losses / period;
  result[period] = averageLoss === 0 ? 100 : 100 - 100 / (1 + averageGain / averageLoss);
  for (let index = period + 1; index < values.length; index += 1) {
    const change = values[index] - values[index - 1];
    averageGain = (averageGain * (period - 1) + Math.max(change, 0)) / period;
    averageLoss = (averageLoss * (period - 1) + Math.max(-change, 0)) / period;
    result[index] = averageLoss === 0 ? 100 : 100 - 100 / (1 + averageGain / averageLoss);
  }
  return result;
}

export function trueRange(bars: MarketChartPoint[]): number[] {
  return bars.map((bar, index) => index === 0
    ? bar.high - bar.low
    : Math.max(bar.high - bar.low, Math.abs(bar.high - bars[index - 1].close), Math.abs(bar.low - bars[index - 1].close)));
}

export function averageTrueRange(bars: MarketChartPoint[], period = 14): Array<number | null> {
  const ranges = trueRange(bars);
  const result = Array<number | null>(ranges.length).fill(null);
  if (ranges.length < period) return result;
  const seed = mean(ranges.slice(0, period));
  if (seed === null) return result;
  result[period - 1] = seed;
  for (let index = period; index < ranges.length; index += 1) result[index] = ((result[index - 1] as number) * (period - 1) + ranges[index]) / period;
  return result;
}

export function maximumDrawdown(values: number[]): number | null {
  if (!values.length) return null;
  let peak = values[0]; let drawdown = 0;
  for (const value of values) {
    peak = Math.max(peak, value);
    drawdown = Math.min(drawdown, value / peak - 1);
  }
  return drawdown;
}

export function rollingZScore(values: number[], period: number): Array<number | null> {
  return values.map((value, index) => {
    if (index < period - 1) return null;
    const window = values.slice(index - period + 1, index + 1);
    const average = mean(window); const deviation = sampleStandardDeviation(window);
    return average === null || deviation === null || deviation === 0 ? null : (value - average) / deviation;
  });
}

export function onBalanceVolume(bars: MarketChartPoint[]): number[] {
  const result = Array<number>(bars.length).fill(0);
  for (let index = 1; index < bars.length; index += 1) result[index] = result[index - 1] + (bars[index].close > bars[index - 1].close ? bars[index].volume : bars[index].close < bars[index - 1].close ? -bars[index].volume : 0);
  return result;
}

export function accumulationDistribution(bars: MarketChartPoint[]): number[] {
  let cumulative = 0;
  return bars.map((bar) => {
    const range = bar.high - bar.low;
    const multiplier = range === 0 ? 0 : ((bar.close - bar.low) - (bar.high - bar.close)) / range;
    cumulative += multiplier * bar.volume;
    return cumulative;
  });
}

export function normalizeScore(value: number) { return clamp(value, 0, 100); }
