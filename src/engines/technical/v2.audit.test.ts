import { describe, expect, it } from "vitest";
import type { MarketChartPoint } from "@/types";
import { calculateIndicatorSeries } from "./terminal";
import {
  anchoredVwap,
  calculateTechnicalConfluence,
  calculateTechnicalLevels,
  calculateVolumeProfile,
  classifyTechnicalLevel,
  clusterSwingPoints,
  detectSwingPoints,
  FIB_EXTENSION_RATIOS,
  FIB_RETRACEMENT_RATIOS,
  fibonacciExtension,
  fibonacciRetracement,
  heikinAshi,
  scoreTechnicalLevelCluster,
  type SwingPoint,
} from "./v2";

function row(index: number, open: number, high: number, low: number, close: number, volume = 100): MarketChartPoint {
  return { timestamp: new Date(Date.UTC(2025, 0, index + 1)).toISOString(), open, high, low, close, volume };
}

function profileRow(index: number, low: number, high: number, volume: number): MarketChartPoint {
  const middle = (low + high) / 2;
  return row(index, middle, high, low, middle, volume);
}

function swing(index: number, price: number, kind: "HIGH" | "LOW", volume = 100, reaction = 0.02): SwingPoint {
  return { index, price, kind, volume, reaction, timestamp: new Date(Date.UTC(2025, 0, index + 1)).toISOString() };
}

describe("Technical V2 final independent quantitative audit", () => {
  it("validates every Heikin Ashi field, seed, immutability and real-price indicator source", () => {
    const source = [row(0, 10, 14, 8, 12), row(1, 12, 16, 10, 14), row(2, 14, 18, 11, 13)];
    const untouched = structuredClone(source);
    const expected = [
      { open: 11, high: 14, low: 8, close: 11 },
      { open: 11, high: 16, low: 10, close: 13 },
      { open: 12, high: 18, low: 11, close: 14 },
    ];
    expect(heikinAshi(source).map(({ open, high, low, close }) => ({ open, high, low, close }))).toEqual(expected);
    expect(source).toEqual(untouched);
    const realRsiBefore = calculateIndicatorSeries(source).rsi(2);
    heikinAshi(source);
    expect(calculateIndicatorSeries(source).rsi(2)).toEqual(realRsiBefore);
  });

  it("validates all Fibonacci retracement and extension ratios independently", () => {
    const retracementExpected = [200, 176.4, 161.8, 150, 138.2, 121.4, 100];
    const retracement = fibonacciRetracement(100, 200);
    expect(retracement.map((level) => level.ratio)).toEqual([...FIB_RETRACEMENT_RATIOS]);
    retracement.forEach((level, index) => expect(level.price).toBeCloseTo(retracementExpected[index], 10));
    fibonacciRetracement(200, 100).forEach((level, index) => expect(level.price).toBeCloseTo(100 + 100 * FIB_RETRACEMENT_RATIOS[index], 10));

    const extensionExpected = [155.9, 175, 188.6, 205.9, 225];
    const extension = fibonacciExtension(100, 150, 125);
    expect(extension.map((level) => level.ratio)).toEqual([...FIB_EXTENSION_RATIOS]);
    extension.forEach((level, index) => expect(level.price).toBeCloseTo(extensionExpected[index], 10));
  });

  it("confirms pivots only after their symmetric confirmation window", () => {
    const complete = [10, 12, 15, 12, 10].map((close, index) => row(index, close, close + 1, close - 1, close));
    expect(detectSwingPoints(complete.slice(0, 4), 2)).toEqual([]);
    expect(detectSwingPoints(complete, 2)).toMatchObject([{ index: 2, kind: "HIGH", price: 16 }]);
  });

  it("clusters deterministically and independently validates the documented level score", () => {
    const points = [swing(20, 100, "LOW", 100, 0.02), swing(50, 100.2, "LOW", 200, 0.03), swing(90, 100.4, "LOW", 100, 0.01)];
    expect(clusterSwingPoints(points, 0.5)).toHaveLength(1);
    expect(clusterSwingPoints(points, 0.1)).toHaveLength(3);
    const recency = 1 - (99 - 90) / 100;
    const manual = Math.round(Math.min(100, 21 + recency * 20 + 0.02 * 400 + (400 / 3 / 100) * 10 + 6));
    expect(scoreTechnicalLevelCluster(points, 100, 100, 3)).toEqual({ score: manual, recency });
  });

  it("classifies active, testing, stale, broken and both role-reversal directions", () => {
    const support = [swing(10, 100, "LOW"), swing(30, 100.2, "LOW")];
    const resistance = [swing(10, 100, "HIGH"), swing(30, 100.2, "HIGH")];
    expect(classifyTechnicalLevel(support, 110, 99.8, 100.4, 0.5, false)).toEqual({ type: "SUPPORT", status: "ACTIVE" });
    expect(classifyTechnicalLevel(support, 100.3, 99.8, 100.4, 0.5, false)).toEqual({ type: "SUPPORT", status: "TESTING" });
    expect(classifyTechnicalLevel(support, 95, 99.8, 100.4, 0.5, false)).toEqual({ type: "SUPPORT", status: "BROKEN" });
    expect(classifyTechnicalLevel(resistance, 105, 99.8, 100.4, 0.5, false)).toEqual({ type: "RESISTANCE", status: "BROKEN" });
    expect(classifyTechnicalLevel(support, 110, 99.8, 100.4, 0.5, true)).toEqual({ type: "SUPPORT", status: "STALE" });
    expect(classifyTechnicalLevel([swing(10, 100, "LOW"), swing(30, 100.1, "HIGH")], 98, 99.8, 100.4, 0.5, false)).toEqual({ type: "RESISTANCE", status: "FLIPPED" });
    expect(classifyTechnicalLevel([swing(10, 100, "HIGH"), swing(30, 100.1, "LOW")], 102, 99.8, 100.4, 0.5, false)).toEqual({ type: "SUPPORT", status: "FLIPPED" });
  });

  it("keeps S/R prefix-only, stable and quality-filtered", () => {
    const rows = Array.from({ length: 120 }, (_, index) => {
      const close = 100 + Math.sin(index * Math.PI / 4) * 8 + index * 0.02;
      return row(index, close, close + 1.2, close - 1.2, close, 1_000 + index % 4 * 50);
    });
    const prefix = calculateTechnicalLevels(rows.slice(0, 91), { pivotWidth: 2 });
    const asOf = calculateTechnicalLevels(rows.map((bar, index) => index > 90 ? { ...bar, open: 1_000, high: 1_100, low: 900, close: 1_050 } : bar), { pivotWidth: 2, asOfIndex: 90 });
    expect(asOf).toEqual(prefix);
    expect(calculateTechnicalLevels(rows.slice(0, 20))).toEqual([]);
    expect(new Set(prefix.map((level) => level.id)).size).toBe(prefix.length);
    const slightlyChanged = rows.map((bar, index) => index === rows.length - 1 ? { ...bar, close: bar.close * 1.0001 } : bar);
    expect(calculateTechnicalLevels(slightlyChanged, { pivotWidth: 2 }).slice(0, 2).map((level) => level.centerPrice)).toEqual(calculateTechnicalLevels(rows, { pivotWidth: 2 }).slice(0, 2).map((level) => level.centerPrice));
  });

  it("allocates half-open profile bins without edge double counting and conserves volume", () => {
    const bars = [profileRow(0, 100, 102, 100), profileRow(1, 102, 104, 90)];
    const profile = calculateVolumeProfile(bars, 4, 0.7);
    expect(profile.status).toBe("AVAILABLE");
    expect(profile.bins.map((bin) => bin.volume)).toEqual([50, 50, 45, 45]);
    expect(profile.totalVolume).toBeCloseTo(190, 12);
    expect(profile.bins.reduce((sum, bin) => sum + bin.volume, 0)).toBeCloseTo(bars.reduce((sum, bar) => sum + bar.volume, 0), 12);
    expect(profile.poc).toBe(100.5);
    expect(profile.val).toBe(100);
    expect(profile.vah).toBe(103);
  });

  it("uses deterministic lower-bin tie-breaking for the 70% value area", () => {
    const profile = calculateVolumeProfile([
      profileRow(0, 1, 2, 10),
      profileRow(1, 2, 3, 40),
      profileRow(2, 3, 4, 100),
      profileRow(3, 4, 5, 40),
    ], 4, 0.7);
    expect(profile.bins.map((bin) => bin.valueArea)).toEqual([false, true, true, false]);
    expect(profile.poc).toBe(3.5);
    expect(profile.val).toBe(2);
    expect(profile.vah).toBe(4);
  });

  it("recomputes profile only from the supplied visible slice", () => {
    const bars = [profileRow(0, 10, 12, 100), profileRow(1, 12, 14, 200), profileRow(2, 30, 32, 900), profileRow(3, 32, 34, 800)];
    const first = calculateVolumeProfile(bars.slice(0, 2), 4);
    const second = calculateVolumeProfile(bars.slice(2), 4);
    expect(first.totalVolume).toBe(300);
    expect(second.totalVolume).toBe(1_700);
    expect(first.poc).not.toBe(second.poc);
  });

  it("validates anchored VWAP start and continuation across sessions", () => {
    const rows = [row(0, 10, 12, 8, 10, 100), row(1, 20, 22, 18, 20, 200), row(2, 30, 33, 27, 30, 100)];
    expect(anchoredVwap(rows, rows[1].timestamp)).toEqual([null, 20, 70 / 3]);
  });

  it("classifies confluence deterministically and stays partial without volume", () => {
    const rows = Array.from({ length: 80 }, (_, index) => row(index, 100 + index, 102 + index, 99 + index, 101 + index, 1_000));
    const complete = calculateTechnicalConfluence(rows, calculateTechnicalLevels(rows), calculateVolumeProfile(rows));
    expect(complete.trend).toBe("BULLISH");
    expect(complete.volatility).toBe("NORMAL");
    expect(complete.reasons).toContain("ATR is 1.67% of price.");
    const partial = calculateTechnicalConfluence(rows, [], calculateVolumeProfile(rows.map((bar) => ({ ...bar, volume: 0 }))));
    expect(partial.status).toBe("PARTIAL");
    expect(partial.volume).toBe("Volume profile unavailable");
    expect(JSON.stringify(complete)).not.toMatch(/STRONG BUY|STRONG SELL|\bBUY\b|\bSELL\b/i);
  });
});
