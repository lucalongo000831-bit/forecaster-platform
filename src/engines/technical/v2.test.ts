import { describe, expect, it } from "vitest";
import type { MarketChartPoint } from "@/types";
import {
  anchoredVwap,
  calculateTechnicalConfluence,
  calculateTechnicalLevels,
  calculateVolumeProfile,
  clusterSwingPoints,
  detectSwingPoints,
  fibonacciExtension,
  fibonacciRetracement,
  heikinAshi,
} from "./v2";

function bar(day: number, open: number, high: number, low: number, close: number, volume = 100): MarketChartPoint {
  return { timestamp: new Date(Date.UTC(2025, 0, day)).toISOString(), open, high, low, close, volume };
}

describe("Technical V2 independent quantitative calculations", () => {
  it("matches a manually derived Heikin Ashi golden series", () => {
    const result = heikinAshi([
      bar(1, 10, 14, 8, 12),
      bar(2, 12, 16, 10, 14),
      bar(3, 14, 18, 11, 13),
    ]);
    expect(result[0]).toMatchObject({ open: 11, high: 14, low: 8, close: 11, derived: true });
    expect(result[1].open).toBe(11);
    expect(result[1].close).toBe(13);
    expect(result[1].high).toBe(16);
    expect(result[1].low).toBe(10);
    expect(result[2].open).toBe(12);
    expect(result[2].close).toBe(14);
    expect(result[2].high).toBe(18);
    expect(result[2].low).toBe(11);
  });

  it("does not let future real candles alter historical HA values", () => {
    const source = [bar(1, 10, 14, 8, 12), bar(2, 12, 16, 10, 14), bar(3, 14, 18, 11, 13)];
    expect(heikinAshi([...source, bar(4, 100, 120, 90, 110)]).slice(0, 3)).toEqual(heikinAshi(source));
  });

  it("matches canonical Fibonacci retracement in both directions", () => {
    const upward = fibonacciRetracement(100, 200);
    expect(upward.find((level) => level.ratio === 0)?.price).toBe(200);
    expect(upward.find((level) => level.ratio === 0.5)?.price).toBe(150);
    expect(upward.find((level) => level.ratio === 0.618)?.price).toBeCloseTo(138.2);
    expect(upward.find((level) => level.ratio === 1)?.price).toBe(100);
    const downward = fibonacciRetracement(200, 100);
    expect(downward.find((level) => level.ratio === 0)?.price).toBe(100);
    expect(downward.find((level) => level.ratio === 0.618)?.price).toBeCloseTo(161.8);
    expect(downward.find((level) => level.ratio === 1)?.price).toBe(200);
  });

  it("matches manually derived Fibonacci extension geometry", () => {
    const result = fibonacciExtension(100, 150, 125);
    expect(result).toEqual([
      { ratio: 0.618, price: 155.9 },
      { ratio: 1, price: 175 },
      { ratio: 1.272, price: 188.6 },
      { ratio: 1.618, price: 205.9 },
      { ratio: 2, price: 225 },
    ]);
  });

  it("calculates anchored VWAP without session resets", () => {
    const rows = [bar(1, 10, 12, 8, 10, 100), bar(2, 20, 22, 18, 20, 200), bar(3, 30, 33, 27, 30, 100)];
    const result = anchoredVwap(rows, rows[1].timestamp);
    expect(result[0]).toBeNull();
    expect(result[1]).toBe(20);
    expect(result[2]).toBeCloseTo(70 / 3);
  });

  it("detects deterministic pivots and volatility-aware clusters", () => {
    const rows = [10, 12, 15, 12, 10, 8, 10, 13, 15.1, 12, 9].map((close, index) => bar(index + 1, close, close + 1, close - 1, close));
    const swings = detectSwingPoints(rows, 2);
    expect(swings.map((point) => point.kind)).toEqual(["HIGH", "LOW", "HIGH"]);
    const highs = swings.filter((point) => point.kind === "HIGH");
    expect(clusterSwingPoints(highs, 0.2)).toHaveLength(1);
    expect(clusterSwingPoints(highs, 0.01)).toHaveLength(2);
  });

  it("recovers qualified levels, deduplicates zones and respects as-of history", () => {
    const rows = Array.from({ length: 90 }, (_, index) => {
      const close = 100 + Math.sin(index * Math.PI / 4) * 8 + index * 0.03;
      return { ...bar(index + 1, close, close + 1.2, close - 1.2, close, 1_000 + (index % 5) * 50), timestamp: new Date(Date.UTC(2025, 0, index + 1)).toISOString() };
    });
    const at60 = calculateTechnicalLevels(rows, { pivotWidth: 2, asOfIndex: 60 });
    const prefix = calculateTechnicalLevels(rows.slice(0, 61), { pivotWidth: 2 });
    expect(at60).toEqual(prefix);
    expect(at60.length).toBeGreaterThan(0);
    expect(at60.filter((level) => level.type === "SUPPORT").length).toBeLessThanOrEqual(5);
    expect(at60.filter((level) => level.type === "RESISTANCE").length).toBeLessThanOrEqual(5);
    expect(new Set(at60.map((level) => level.id)).size).toBe(at60.length);
    expect(at60.every((level) => level.score >= 35 && level.touches >= 2)).toBe(true);
    expect(calculateTechnicalLevels(rows.slice(0, 20))).toEqual([]);
  });

  it("matches a manually derived bar-based volume-profile golden fixture", () => {
    const profile = calculateVolumeProfile([
      bar(1, 101, 102, 100, 101, 100),
      bar(2, 103, 104, 102, 103, 90),
    ], 4, 0.7);
    expect(profile.status).toBe("AVAILABLE");
    expect(profile.bins.map((bin) => bin.volume)).toEqual([100 / 3, 100 / 3, 100 / 3 + 45, 45]);
    expect(profile.poc).toBe(102.5);
    expect(profile.val).toBe(101);
    expect(profile.vah).toBe(104);
    expect(profile.bins.filter((bin) => bin.valueArea).reduce((sum, bin) => sum + bin.volume, 0) / profile.totalVolume).toBeGreaterThanOrEqual(0.7);
    expect(profile.methodology).toBe("UNIFORM_BAR_RANGE_ALLOCATION");
  });

  it("returns an explicit unavailable profile instead of fake zero volume", () => {
    const profile = calculateVolumeProfile([bar(1, 10, 12, 8, 10, 0), bar(2, 11, 13, 9, 12, 0)]);
    expect(profile).toMatchObject({ status: "UNAVAILABLE", reason: "VOLUME_UNAVAILABLE", bins: [], poc: null });
  });

  it("produces descriptive confluence without buy or sell labels", () => {
    const rows = Array.from({ length: 80 }, (_, index) => bar(index + 1, 100 + index, 102 + index, 99 + index, 101 + index, 1_000));
    const levels = calculateTechnicalLevels(rows);
    const profile = calculateVolumeProfile(rows);
    const result = calculateTechnicalConfluence(rows, levels, profile);
    expect(result.trend).toBe("BULLISH");
    expect(JSON.stringify(result)).not.toMatch(/STRONG BUY|STRONG SELL|\bBUY\b|\bSELL\b/i);
    expect(result.reasons.length).toBeGreaterThan(0);
  });
});
