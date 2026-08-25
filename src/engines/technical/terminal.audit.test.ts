import { describe, expect, it } from "vitest";
import type { MarketChartPoint } from "@/types";
import {
  applyCanonicalPricePolicy,
  bollingerBands,
  calculateIndicatorSeries,
  movingAverageConvergenceDivergence,
  normalizeSeriesAtCommonStart,
  resampleFourHourBars,
  sanitizeTechnicalBars,
  volumeWeightedAveragePrice,
} from "./terminal";
import { averageTrueRange, exponentialMovingAverage, relativeStrengthIndex, simpleMovingAverage } from "./indicators";

function bar(timestamp: string, open: number, high: number, low: number, close: number, volume = 100): MarketChartPoint {
  return { timestamp, open, high, low, close, adjustedClose: close, volume };
}

function hourly(start: string, count: number): MarketChartPoint[] {
  const origin = Date.parse(start);
  return Array.from({ length: count }, (_, index) => {
    const open = 100 + index;
    return bar(new Date(origin + index * 3_600_000).toISOString(), open, open + 2, open - 1, open + 1, 10 + index);
  });
}

function referenceEma(values: number[], period: number): Array<number | null> {
  const output = Array<number | null>(values.length).fill(null);
  if (values.length < period) return output;
  const alpha = 2 / (period + 1);
  output[period - 1] = values.slice(0, period).reduce((sum, value) => sum + value, 0) / period;
  for (let index = period; index < values.length; index += 1) output[index] = values[index] * alpha + (output[index - 1] as number) * (1 - alpha);
  return output;
}

function referenceRsi(values: number[], period: number): Array<number | null> {
  const output = Array<number | null>(values.length).fill(null);
  let gain = 0;
  let loss = 0;
  for (let index = 1; index <= period; index += 1) {
    const delta = values[index] - values[index - 1];
    gain += Math.max(delta, 0);
    loss += Math.max(-delta, 0);
  }
  gain /= period;
  loss /= period;
  const value = () => loss === 0 ? gain === 0 ? 50 : 100 : 100 - 100 / (1 + gain / loss);
  output[period] = value();
  for (let index = period + 1; index < values.length; index += 1) {
    const delta = values[index] - values[index - 1];
    gain = (gain * (period - 1) + Math.max(delta, 0)) / period;
    loss = (loss * (period - 1) + Math.max(-delta, 0)) / period;
    output[index] = value();
  }
  return output;
}

describe("Technical Chart V1 independent quantitative audit", () => {
  it("enforces OHLC invariants, ascending order and deterministic timestamp dedupe", () => {
    const valid = hourly("2026-03-08T06:00:00.000Z", 3);
    const malformed = [
      bar("2026-03-08T09:00:00.000Z", 10, 9, 8, 10),
      bar("2026-03-08T10:00:00.000Z", 10, 12, 11, 10),
      { ...bar("2026-03-08T11:00:00.000Z", 10, 12, 8, 11), volume: -1 },
    ];
    const duplicate = { ...valid[1], close: valid[1].close + .25 };
    const result = sanitizeTechnicalBars([valid[2], valid[0], valid[1], duplicate, ...malformed]);
    expect(result).toHaveLength(3);
    expect(result.map((row) => Date.parse(row.timestamp))).toEqual([...result.map((row) => Date.parse(row.timestamp))].sort((a, b) => a - b));
    expect(new Set(result.map((row) => row.timestamp)).size).toBe(result.length);
    expect(result[1].close).toBe(duplicate.close);
    expect(result.every((row) => row.high >= Math.max(row.open, row.close) && row.low <= Math.min(row.open, row.close) && row.high >= row.low)).toBe(true);
  });

  it("never mixes adjusted and raw equity bars when adjustment coverage is partial", () => {
    const rows = hourly("2026-01-01T00:00:00.000Z", 2);
    delete rows[1].adjustedClose;
    expect(applyCanonicalPricePolicy(rows, "EQUITY").policy).toBe("RAW_OHLC");
  });

  it("resamples only four contiguous 1h bars and preserves exact OHLCV", () => {
    const source = hourly("2026-01-01T00:00:00.000Z", 4);
    const [result] = resampleFourHourBars(source);
    expect(result).toEqual({
      timestamp: "2026-01-01T00:00:00.000Z",
      open: 100,
      high: 105,
      low: 99,
      close: 104,
      adjustedClose: 104,
      volume: 46,
    });
    expect(resampleFourHourBars(source.filter((_, index) => index !== 2))).toEqual([]);
    expect(resampleFourHourBars([source[0], source[1], { ...source[2], timestamp: "2026-01-01T03:30:00.000Z" }, source[3]])).toEqual([]);
  });

  it("does not merge equity session gaps and groups crypto on UTC four-hour boundaries", () => {
    const equityGap = [
      ...hourly("2026-01-01T20:00:00.000Z", 2),
      ...hourly("2026-01-02T00:00:00.000Z", 2),
    ];
    expect(resampleFourHourBars(equityGap)).toEqual([]);
    const crypto = hourly("2026-01-01T20:00:00.000Z", 8);
    const result = resampleFourHourBars(crypto);
    expect(result.map((row) => row.timestamp)).toEqual(["2026-01-01T20:00:00.000Z", "2026-01-02T00:00:00.000Z"]);
  });

  it("matches independent SMA and EMA reference values with null warmup", () => {
    const values = [3, 1, 4, 1, 5, 9, 2, 6];
    expect(simpleMovingAverage(values, 3)).toEqual([null, null, 8 / 3, 2, 10 / 3, 5, 16 / 3, 17 / 3]);
    expect(exponentialMovingAverage(values, 3)).toEqual(referenceEma(values, 3));
    expect(simpleMovingAverage(values, 200).every((value) => value === null)).toBe(true);
    expect(exponentialMovingAverage(values, Number.NaN).every((value) => value === null)).toBe(true);
  });

  it("matches independent Wilder RSI including rising, falling and flat boundaries", () => {
    const values = [44, 44.5, 44.2, 45, 44.8, 45.4, 45.1, 46, 45.7, 46.4, 46.1, 47, 46.8, 47.4, 47.1, 47.8, 48.2, 47.9, 48.6, 49];
    const actual = relativeStrengthIndex(values, 14);
    const expected = referenceRsi(values, 14);
    actual.forEach((value, index) => value === null ? expect(expected[index]).toBeNull() : expect(value).toBeCloseTo(expected[index] as number, 12));
    expect(relativeStrengthIndex(Array(20).fill(10), 14).at(-1)).toBe(50);
    expect(relativeStrengthIndex(Array.from({ length: 20 }, (_, index) => index), 14).at(-1)).toBe(100);
    expect(relativeStrengthIndex(Array.from({ length: 20 }, (_, index) => 20 - index), 14).at(-1)).toBe(0);
  });

  it("matches independent MACD, Bollinger and Wilder ATR calculations", () => {
    const values = Array.from({ length: 50 }, (_, index) => 100 + Math.sin(index / 3) * 2 + index * .4);
    const expectedFast = referenceEma(values, 12);
    const expectedSlow = referenceEma(values, 26);
    const expectedMacd = values.map((_, index) => expectedFast[index] === null || expectedSlow[index] === null ? null : (expectedFast[index] as number) - (expectedSlow[index] as number));
    const compactMacd = expectedMacd.filter((value): value is number => value !== null);
    const expectedSignalCompact = referenceEma(compactMacd, 9);
    const actual = movingAverageConvergenceDivergence(values);
    expect(actual.macd[30]).toBeCloseTo(expectedMacd[30] as number, 12);
    expect(actual.signal[40]).toBeCloseTo(expectedSignalCompact[15] as number, 12);
    expect(actual.histogram[40]).toBeCloseTo((expectedMacd[40] as number) - (expectedSignalCompact[15] as number), 12);
    expect(movingAverageConvergenceDivergence(values, 26, 12, 9).macd.every((value) => value === null)).toBe(true);

    const bands = bollingerBands([1, 2, 3, 4, 5], 5, 2);
    expect(bands.middle[4]).toBe(3);
    expect(bands.upper[4]).toBeCloseTo(3 + 2 * Math.sqrt(2), 12);
    expect(bands.lower[4]).toBeCloseTo(3 - 2 * Math.sqrt(2), 12);
    expect(bollingerBands(values, 5, 0).upper.every((value) => value === null)).toBe(true);

    const ranges = [2, 3, 4];
    const atrBars = [bar("2026-01-01T00:00:00Z", 10, 11, 9, 10), bar("2026-01-02T00:00:00Z", 12, 13, 10, 12), bar("2026-01-03T00:00:00Z", 9, 12, 8, 11)];
    expect(averageTrueRange(atrBars, 3).at(-1)).toBe(ranges.reduce((sum, value) => sum + value, 0) / 3);
  });

  it("resets VWAP at each UTC session and rejects missing volume", () => {
    const rows = [
      bar("2026-01-01T22:00:00Z", 10, 12, 9, 11, 10),
      bar("2026-01-01T23:00:00Z", 11, 14, 10, 13, 30),
      bar("2026-01-02T00:00:00Z", 20, 22, 19, 21, 5),
      bar("2026-01-02T01:00:00Z", 21, 23, 20, 22, 0),
    ];
    const typical = (row: MarketChartPoint) => (row.high + row.low + row.close) / 3;
    const result = volumeWeightedAveragePrice(rows);
    expect(result[0]).toBeCloseTo(typical(rows[0]));
    expect(result[1]).toBeCloseTo((typical(rows[0]) * 10 + typical(rows[1]) * 30) / 40);
    expect(result[2]).toBeCloseTo(typical(rows[2]));
    expect(result[3]).toBeNull();
  });

  it("rebases every comparison at its first valid point on or after the shared boundary", () => {
    const normalized = normalizeSeriesAtCommonStart([
      [{ timestamp: "2026-01-01T00:00:00Z", value: 100 }, { timestamp: "2026-01-02T00:00:00Z", value: 110 }, { timestamp: "2026-01-03T00:00:00Z", value: 121 }],
      [{ timestamp: "2026-01-02T00:00:00Z", value: 50 }, { timestamp: "2026-01-03T00:00:00Z", value: 45 }],
    ]);
    expect(normalized[0][0]).toBeNull();
    expect(normalized[0][1]).toBe(0);
    expect(normalized[0][2]).toBeCloseTo(10);
    expect(normalized[1][0]).toBe(0);
    expect(normalized[1][1]).toBeCloseTo(-10);
  });

  it("preserves every historical indicator when all future bars are replaced", () => {
    const original = hourly("2026-01-01T00:00:00Z", 80);
    const changed = original.map((row, index) => index <= 50 ? row : { ...row, open: row.open * 1.5, high: row.high * 1.5, low: row.low * 1.5, close: row.close * 1.5 });
    const left = calculateIndicatorSeries(original);
    const right = calculateIndicatorSeries(changed);
    expect(right.sma(20).slice(0, 51)).toEqual(left.sma(20).slice(0, 51));
    expect(right.ema(20).slice(0, 51)).toEqual(left.ema(20).slice(0, 51));
    expect(right.bollinger().upper.slice(0, 51)).toEqual(left.bollinger().upper.slice(0, 51));
    expect(right.rsi().slice(0, 51)).toEqual(left.rsi().slice(0, 51));
    expect(right.macd().histogram.slice(0, 51)).toEqual(left.macd().histogram.slice(0, 51));
    expect(right.atr().slice(0, 51)).toEqual(left.atr().slice(0, 51));
    expect(right.vwap().slice(0, 51)).toEqual(left.vwap().slice(0, 51));
  });
});
