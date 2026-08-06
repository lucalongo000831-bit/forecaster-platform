import { describe, expect, it } from "vitest";
import type { MarketChartPoint } from "@/types";
import { analyzeTechnical } from "./engine";
import { averageTrueRange, exponentialMovingAverage, maximumDrawdown, relativeStrengthIndex, simpleMovingAverage, trueRange } from "./indicators";

function bars(length: number, start = 100): MarketChartPoint[] {
  return Array.from({ length }, (_, index) => {
    const close = start + index * 0.5 + Math.sin(index / 4);
    return { timestamp: new Date(Date.UTC(2024, 0, index + 1)).toISOString(), open: close - 0.4, high: close + 1, low: close - 1, close, adjustedClose: close, volume: 1_000 + index * 10 };
  });
}

describe("technical indicators", () => {
  it("calculates SMA without reading future observations", () => {
    const values = [1, 2, 3, 4, 5, 100];
    const full = simpleMovingAverage(values, 3);
    const prefix = simpleMovingAverage(values.slice(0, 5), 3);
    expect(full.slice(0, 5)).toEqual(prefix);
    expect(full[4]).toBe(4);
  });

  it("seeds and evolves EMA deterministically", () => {
    expect(exponentialMovingAverage([1, 2, 3, 4, 5], 3)).toEqual([null, null, 2, 3, 4]);
  });

  it("returns RSI 100 for a strictly rising series", () => {
    const result = relativeStrengthIndex(Array.from({ length: 30 }, (_, index) => index + 1), 14);
    expect(result.at(-1)).toBe(100);
  });

  it("calculates true range and Wilder ATR", () => {
    const input = bars(20);
    expect(trueRange(input)).toHaveLength(20);
    expect(averageTrueRange(input, 14).at(-1)).toBeTypeOf("number");
  });

  it("calculates maximum drawdown", () => {
    expect(maximumDrawdown([100, 120, 90, 110])).toBeCloseTo(-0.25);
  });

  it("produces a serializable, versioned analysis", () => {
    const result = analyzeTechnical("ACME", bars(260));
    expect(result.modelVersion).toBe("technical-v1.0.0");
    expect(result.trend.sma["200"].value).toBeTypeOf("number");
    expect(result.score).toBeGreaterThanOrEqual(0);
    expect(result.score).toBeLessThanOrEqual(100);
    expect(JSON.stringify(result)).not.toContain("NaN");
  });

  it("rejects an insufficient sample", () => {
    expect(() => analyzeTechnical("ACME", bars(20))).toThrow("INSUFFICIENT_TECHNICAL_DATA");
  });
});
