import { describe, expect, it } from "vitest";
import type { MarketChartPoint, TechnicalTimeframe } from "@/types";
import {
  calculateAnchoredVolumeProfile,
  calculateDivergencesFromSeries,
  calculateFixedRangeVolumeProfile,
  calculateMarketStructure,
  calculateMtfStructure,
  calculateMtfTechnicalLevels,
  calculateSessionAnalytics,
  technicalTimeframeWeight,
} from "./v3";

function barsFromCloses(closes: number[], volume = 1_000): MarketChartPoint[] {
  return closes.map((close, index) => ({
    timestamp: new Date(Date.UTC(2025, 0, 1, 14, index * 5)).toISOString(),
    open: close,
    high: close + 0.5,
    low: close - 0.5,
    close,
    volume,
  }));
}

const uptrend = [100, 104, 110, 106, 102, 107, 115, 110, 105, 112, 121, 115, 109, 117, 126, 120, 114, 122, 130];
const downtrend = [130, 126, 120, 124, 128, 121, 115, 120, 125, 117, 109, 114, 120, 111, 103, 108, 114, 106, 98];

describe("Technical V3 market structure", () => {
  it("classifies confirmed HH/HL and an uptrend without backdating pivots", () => {
    const result = calculateMarketStructure(barsFromCloses(uptrend), { minorWidth: 1, majorWidth: 2 });
    expect(result.status).toBe("AVAILABLE");
    expect(result.swings.some((swing) => swing.label === "HH")).toBe(true);
    expect(result.swings.some((swing) => swing.label === "HL")).toBe(true);
    expect(result.state).toBe("UPTREND");
    expect(result.protectedLow?.kind).toBe("LOW");
    expect(result.swings.every((swing) => swing.confirmationIndex > swing.index)).toBe(true);
  });

  it("classifies confirmed LH/LL and a downtrend", () => {
    const result = calculateMarketStructure(barsFromCloses(downtrend), { minorWidth: 1, majorWidth: 2 });
    expect(result.swings.some((swing) => swing.label === "LH")).toBe(true);
    expect(result.swings.some((swing) => swing.label === "LL")).toBe(true);
    expect(result.state).toBe("DOWNTREND");
    expect(result.protectedHigh?.kind).toBe("HIGH");
  });

  it("keeps equal oscillating pivots in range and avoids BOS spam", () => {
    const rows = barsFromCloses([100, 105, 100, 95, 100, 105.02, 100, 95.01, 100, 104.99, 100, 95.02, 100]);
    const result = calculateMarketStructure(rows, { minorWidth: 1, majorWidth: 2 });
    expect(result.state).toBe("RANGE");
    expect(result.events).toEqual([]);
  });

  it("emits one close-confirmed BOS and one opposing CHOCH", () => {
    const continuation = [...uptrend, 132, 134, 128, 124, 116, 108];
    const result = calculateMarketStructure(barsFromCloses(continuation), { minorWidth: 1, majorWidth: 2 });
    expect(result.events.some((event) => event.type === "BOS" && event.direction === "BULLISH")).toBe(true);
    expect(result.events.some((event) => event.type === "CHOCH" && event.direction === "BEARISH")).toBe(true);
    expect(result.events.every((event) => event.availableAt === event.confirmationTimestamp)).toBe(true);
  });

  it("is point-in-time invariant when future bars mutate", () => {
    const prefix = barsFromCloses([...uptrend, 132]);
    const future = barsFromCloses([500, 50, 600, 40]).map((bar, index) => ({ ...bar, timestamp: new Date(Date.UTC(2025, 0, 2, 14, index * 5)).toISOString() }));
    const expected = calculateMarketStructure(prefix, { minorWidth: 1, majorWidth: 2 });
    const actual = calculateMarketStructure([...prefix, ...future], { asOfIndex: prefix.length - 1, minorWidth: 1, majorWidth: 2 });
    expect(actual).toEqual(expected);
  });
});

describe("Technical V3 MTF levels and profiles", () => {
  it("retains timeframe sources, clusters confluence and applies documented HTF weight", () => {
    const source = Object.fromEntries((["15m", "1h", "4h", "1D"] as TechnicalTimeframe[]).map((timeframe, offset) => [timeframe, barsFromCloses(Array.from({ length: 100 }, (_, index) => 100 + Math.sin(index * Math.PI / 4) * 8 + offset * 0.03))]));
    const levels = calculateMtfTechnicalLevels(source, { maxZones: 10 });
    expect(levels.length).toBeGreaterThan(0);
    expect(levels.some((level) => level.confluenceCount > 1 && level.timeframes.length > 1)).toBe(true);
    expect(technicalTimeframeWeight("1D")).toBeGreaterThan(technicalTimeframeWeight("4h"));
    expect(levels.every((level) => level.higherTimeframeWeight >= 0.8 && level.score <= 100)).toBe(true);
    expect(calculateMtfStructure(source).map((row) => row.timeframe)).toEqual(["15m", "1h", "4h", "1D"]);
  });

  it("isolates fixed/anchored profile ranges and conserves source volume", () => {
    const rows = barsFromCloses([100, 102, 104, 106, 108], 100);
    const fixed = calculateFixedRangeVolumeProfile(rows, rows[1].timestamp, rows[3].timestamp, 4, 0.7);
    expect(fixed.status).toBe("AVAILABLE");
    expect(fixed.totalVolume).toBeCloseTo(300, 10);
    expect(fixed.bins.reduce((sum, bin) => sum + bin.volume, 0)).toBeCloseTo(300, 10);
    expect(fixed.rangeStart).toBe(rows[1].timestamp);
    expect(fixed.rangeEnd).toBe(rows[3].timestamp);
    const anchored = calculateAnchoredVolumeProfile(rows, rows[2].timestamp, undefined, 4, 0.7);
    expect(anchored.totalVolume).toBeCloseTo(300, 10);
    expect(anchored.rangeEnd).toBe(rows[4].timestamp);
  });

  it("rejects invalid profile parameters without inventing data", () => {
    const rows = barsFromCloses([100, 102, 104]);
    expect(calculateFixedRangeVolumeProfile(rows, rows[0].timestamp, rows[2].timestamp, 3).reason).toBe("INVALID_CONFIGURATION");
    expect(calculateAnchoredVolumeProfile(rows, rows[0].timestamp, undefined, 24, 1).reason).toBe("INVALID_CONFIGURATION");
  });
});

describe("Technical V3 divergence and sessions", () => {
  it("detects aligned bullish and bearish RSI divergences", () => {
    const bullishBars = barsFromCloses([105, 103, 100, 103, 106, 102, 98, 102, 107]);
    const bullishRsi = [55, 45, 25, 42, 55, 44, 35, 48, 60];
    const bullish = calculateDivergencesFromSeries(bullishBars, bullishRsi, "RSI", { pivotWidth: 1, alignmentTolerance: 0 });
    expect(bullish).toMatchObject([{ type: "REGULAR_BULLISH", direction: "BULLISH", indicator: "RSI" }]);
    const bearishBars = barsFromCloses([95, 98, 100, 97, 94, 99, 103, 99, 95]);
    const bearishRsi = [45, 55, 75, 58, 42, 56, 65, 52, 40];
    const bearish = calculateDivergencesFromSeries(bearishBars, bearishRsi, "RSI", { pivotWidth: 1, alignmentTolerance: 0 });
    expect(bearish).toMatchObject([{ type: "REGULAR_BEARISH", direction: "BEARISH", indicator: "RSI" }]);
  });

  it("supports MACD line divergence and filters unrelated extrema", () => {
    const rows = barsFromCloses([105, 103, 100, 103, 106, 102, 98, 102, 107]);
    expect(calculateDivergencesFromSeries(rows, [2, 1, -3, 0, 2, 0, -1, 1, 3], "MACD", { pivotWidth: 1, alignmentTolerance: 0 })).toMatchObject([{ indicator: "MACD", direction: "BULLISH" }]);
    expect(calculateDivergencesFromSeries(rows, [2, 1, -3, 0, 2, 0, -4, 1, 3], "RSI", { pivotWidth: 1, alignmentTolerance: 0 })).toEqual([]);
  });

  it("does not create historical divergences from future values", () => {
    const rows = barsFromCloses([105, 103, 100, 103, 106, 102, 98, 102, 107]);
    const values = [55, 45, 25, 42, 55, 44, 35, 48, 60];
    const expected = calculateDivergencesFromSeries(rows, values, "RSI", { pivotWidth: 1, alignmentTolerance: 0 });
    const futureRows = [...rows, ...barsFromCloses([500, 1, 600]).map((bar, index) => ({ ...bar, timestamp: new Date(Date.UTC(2025, 0, 2, 14, index * 5)).toISOString() }))];
    const actual = calculateDivergencesFromSeries(futureRows, [...values, 100, -100, 100], "RSI", { asOfIndex: rows.length - 1, pivotWidth: 1, alignmentTolerance: 0 });
    expect(actual).toEqual(expected);
  });

  it("calculates equity session levels only from eligible intraday bars and rejects crypto semantics", () => {
    const sessionBars = [
      { day: 1, hour: 14, minute: 30, close: 100 }, { day: 1, hour: 14, minute: 35, close: 102 },
      { day: 2, hour: 14, minute: 30, close: 103 }, { day: 2, hour: 14, minute: 35, close: 105 }, { day: 2, hour: 14, minute: 40, close: 104 },
      { day: 2, hour: 14, minute: 45, close: 106 }, { day: 2, hour: 14, minute: 50, close: 107 }, { day: 2, hour: 14, minute: 55, close: 108 },
    ].map(({ day, hour, minute, close }) => ({ timestamp: new Date(Date.UTC(2025, 0, day, hour, minute)).toISOString(), open: close - 0.25, high: close + 1, low: close - 1, close, volume: 100 }));
    const equity = calculateSessionAnalytics(sessionBars, { timeframe: "5m", assetClass: "EQUITY", timeZone: "UTC" });
    expect(equity).toMatchObject({ status: "AVAILABLE", previousDayHigh: 103, previousDayLow: 99, previousClose: 102, todayOpen: 102.75 });
    expect(equity.openingRange15).toEqual({ high: 106, low: 102 });
    expect(equity.openingRange30).toEqual({ high: 109, low: 102 });
    expect(calculateSessionAnalytics(sessionBars, { timeframe: "5m", assetClass: "CRYPTO" })).toMatchObject({ status: "UNAVAILABLE", semantics: "CRYPTO_24_7" });
  });
});
