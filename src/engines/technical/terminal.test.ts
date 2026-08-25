import { describe, expect, it } from "vitest";
import type { MarketChartPoint } from "@/types";
import { applyCanonicalPricePolicy, bollingerBands, calculateIndicatorSeries, movingAverageConvergenceDivergence, normalizedComparison, resampleFourHourBars, sanitizeTechnicalBars, volumeWeightedAveragePrice } from "./terminal";

function hourly(count: number): MarketChartPoint[] {
  return Array.from({ length: count }, (_, index) => ({ timestamp: new Date(Date.UTC(2026, 0, 1, index)).toISOString(), open: index + 1, high: index + 2, low: index + 0.5, close: index + 1.5, adjustedClose: index + 1.5, volume: 100 + index }));
}

describe("technical terminal engine", () => {
  it("back-adjusts equity OHLC but keeps crypto raw", () => {
    const row = { ...hourly(1)[0], close: 10, adjustedClose: 5, open: 8, high: 12, low: 7 };
    expect(applyCanonicalPricePolicy([row], "EQUITY")).toMatchObject({ policy: "ADJUSTED_OHLC", bars: [{ open: 4, high: 6, low: 3.5, close: 5 }] });
    expect(applyCanonicalPricePolicy([row], "CRYPTO")).toMatchObject({ policy: "RAW_OHLC", bars: [{ open: 8, close: 10 }] });
  });

  it("drops invalid bars and never emits NaN", () => {
    const bad = { ...hourly(1)[0], high: Number.NaN };
    expect(sanitizeTechnicalBars([...hourly(2), bad])).toHaveLength(2);
    expect(JSON.stringify(sanitizeTechnicalBars(hourly(2)))).not.toContain("NaN");
  });

  it("resamples only complete four-hour buckets without lookahead", () => {
    const full = resampleFourHourBars(hourly(9));
    const prefix = resampleFourHourBars(hourly(8));
    expect(full).toEqual(prefix);
    expect(full).toHaveLength(2);
    expect(full[0]).toMatchObject({ open: 1, high: 5, low: 0.5, close: 4.5, volume: 406 });
  });

  it("matches golden Bollinger, MACD, VWAP and normalized comparison values", () => {
    const values = Array.from({ length: 40 }, (_, index) => index + 1);
    const bands = bollingerBands(values, 5, 2);
    expect(bands.middle[4]).toBe(3);
    expect(bands.upper[4]).toBeCloseTo(5.82842712);
    expect(bands.lower[4]).toBeCloseTo(0.17157288);
    const macd = movingAverageConvergenceDivergence(values);
    expect(macd.macd[25]).toBeCloseTo(7);
    expect(macd.signal[33]).toBeCloseTo(7);
    expect(macd.histogram[33]).toBeCloseTo(0);
    expect(volumeWeightedAveragePrice(hourly(2))[0]).toBeCloseTo((2 + 0.5 + 1.5) / 3);
    expect(normalizedComparison([100, 110, 90])).toEqual([0, 10.000000000000009, -9.999999999999998]);
  });

  it("keeps every indicator prefix unchanged when a live bar is appended", () => {
    const prefixBars = hourly(40);
    const full = calculateIndicatorSeries(hourly(41));
    const prefix = calculateIndicatorSeries(prefixBars);
    expect(full.sma(20).slice(0, 40)).toEqual(prefix.sma(20));
    expect(full.ema(20).slice(0, 40)).toEqual(prefix.ema(20));
    expect(full.bollinger().upper.slice(0, 40)).toEqual(prefix.bollinger().upper);
    expect(full.rsi().slice(0, 40)).toEqual(prefix.rsi());
    expect(full.macd().histogram.slice(0, 40)).toEqual(prefix.macd().histogram);
    expect(full.atr().slice(0, 40)).toEqual(prefix.atr());
    expect(full.vwap().slice(0, 40)).toEqual(prefix.vwap());
  });
});
