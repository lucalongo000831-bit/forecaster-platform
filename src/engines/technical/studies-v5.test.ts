import { describe, expect, it } from "vitest";
import type { MarketChartPoint, TechnicalIndicatorConfig } from "@/types";
import { atrTrailingStop, directionalMovement, donchianChannels, movingAverageOnVisibleHistory, smoothedMovingAverage, supertrend } from "./studies-v5";

function bars(count = 2400, minutes = 1440): MarketChartPoint[] { return Array.from({ length: count }, (_, index) => { const close = 100 + index / 100 + Math.sin(index / 13); return { timestamp: new Date(Date.UTC(2000, 0, 1) + index * minutes * 60_000).toISOString(), open: close - .2, high: close + 2, low: close - 1, close, volume: 100 }; }); }
function reference(values: number[], period: number, kind: string) {
  const result: Array<number | null> = values.map(() => null);
  for (let index = period - 1; index < values.length; index++) {
    if (kind === "SMA" || index === period - 1) result[index] = values.slice(index - period + 1, index + 1).reduce((sum, value) => sum + value, 0) / period;
    else { const alpha = kind === "SMMA" ? 1 / period : 2 / (period + 1); result[index] = result[index - 1]! + alpha * (values[index] - result[index - 1]!); }
  }
  return result;
}
describe("independent V5 moving averages and pre-roll", () => {
  for (const [timeframe, minutes] of [["1h", 60], ["4h", 240], ["1D", 1440], ["1W", 10080]] as const) {
    for (const kind of ["SMA", "SMMA", "EMA"] as const) it.each([20, 50, 100, 200])(`${timeframe} ${kind} %i agrees with an independent recurrence from first visible candle`, (period) => {
      const source = bars(2400, minutes); const visible = source.slice(2100);
      const actual = movingAverageOnVisibleHistory(source, visible, { id: "ma", kind, period, enabled: true, color: "#123456" });
      const expected = reference(source.map((row) => row.close), period, kind).slice(2100);
      actual.forEach((value, index) => expect(value).toBeCloseTo(expected[index]!, 10));
      expect(actual[0]).not.toBeNull();
      expect(movingAverageOnVisibleHistory(visible, visible, { id: "ma", kind, period, enabled: true, color: "#123456" })[0]).toBeNull();
    });
  }
  it("handles sources and genuine short pre-listing history without fake seeds", () => {
    const source = bars(10); const config: TechnicalIndicatorConfig = { id: "sma", kind: "SMA", period: 3, color: "#123456", enabled: true, source: "high" };
    expect(movingAverageOnVisibleHistory(source, source, config)[2]).toBeCloseTo((source[0].high + source[1].high + source[2].high) / 3);
    const smma = smoothedMovingAverage([1, 2, 3, 4, 5], 3);
    expect(smma.slice(0, 3)).toEqual([null, null, 2]);
    expect(smma[3]).toBeCloseTo(8 / 3, 12); expect(smma[4]).toBeCloseTo(31 / 9, 12);
    expect(smoothedMovingAverage([1, 2], 200)).toEqual([null, null]);
  });
});
describe("V5 professional studies", () => {
  it("Wilder DMI has zero ADX in flat markets and ADX 100 on a strictly rising series", () => {
    const flat = bars(100).map((bar) => ({ ...bar, open: 100, high: 101, low: 99, close: 100 }));
    expect(directionalMovement(flat).adx.at(-1)).toBe(0);
    const rising = bars(100).map((bar, index) => ({ ...bar, high: 103 + index, low: 99 + index, close: 101 + index }));
    const result = directionalMovement(rising, 14);
    expect(result.adx.slice(0, 27).every((value) => value === null)).toBe(true);
    expect(result.adx[27]).toBeCloseTo(100); expect(result.negative.at(-1)).toBe(0); expect(result.positive.at(-1)).toBeCloseTo(25);
  });
  it("Donchian values equal direct rolling max/min, including the current bar only", () => {
    const source = bars(100); const result = donchianChannels(source, 20);
    for (let index = 19; index < source.length; index++) {
      expect(result.upper[index]).toBe(Math.max(...source.slice(index - 19, index + 1).map((bar) => bar.high)));
      expect(result.lower[index]).toBe(Math.min(...source.slice(index - 19, index + 1).map((bar) => bar.low)));
    }
  });
  it("ATR stops ratchet in the requested direction and Supertrend follows its published ATR bands", () => {
    const flat = bars(40).map((bar) => ({ ...bar, open: 100, high: 102, low: 98, close: 101 }));
    const trend = supertrend(flat, 10, 3);
    expect(trend.line[9]).toBe(88); expect(trend.direction[9]).toBe(1);
    const source = bars(100); const long = atrTrailingStop(source, 14, 3, "LONG").filter((value) => value !== null);
    const short = atrTrailingStop(source, 14, 3, "SHORT").filter((value) => value !== null);
    expect(long.every((value, index) => !index || value >= long[index - 1]!)).toBe(true);
    expect(short.every((value, index) => !index || value <= short[index - 1]!)).toBe(true);
  });
  it("future candles cannot revise prior confirmed MA, DMI, Supertrend, channels or stops", () => {
    const source = bars(400); const prefix = source.slice(0, 250);
    expect(supertrend(source).line.slice(0, 250)).toEqual(supertrend(prefix).line);
    expect(directionalMovement(source).adx.slice(0, 250)).toEqual(directionalMovement(prefix).adx);
    expect(donchianChannels(source).upper.slice(0, 250)).toEqual(donchianChannels(prefix).upper);
    expect(atrTrailingStop(source).slice(0, 250)).toEqual(atrTrailingStop(prefix));
    for (const kind of ["SMA", "SMMA", "EMA"] as const) {
      const config = { id: "ma", kind, period: 200, enabled: true, color: "#123456" };
      expect(movingAverageOnVisibleHistory(source, prefix, config)).toEqual(movingAverageOnVisibleHistory(prefix, prefix, config));
    }
  });
});
