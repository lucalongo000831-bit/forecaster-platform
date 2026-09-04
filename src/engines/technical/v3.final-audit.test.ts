import { describe, expect, it } from "vitest";
import type { MarketChartPoint } from "@/types";
import {
  calculateDivergencesFromSeries,
  calculateMarketStructure,
  calculateSessionAnalytics,
  completedTechnicalBarsAt,
  technicalTimeframeWeight,
} from "./v3";

function bar(timestamp: string, close: number, volume = 100): MarketChartPoint {
  return { timestamp, open: close, high: close + 0.5, low: close - 0.5, close, volume };
}

function series(closes: number[], start = Date.UTC(2025, 0, 2, 14, 30), step = 5 * 60_000) {
  return closes.map((close, index) => bar(new Date(start + index * step).toISOString(), close));
}

describe("Technical V3 independent point-in-time audit", () => {
  it("exposes the documented deterministic timeframe weights", () => {
    expect((["1m", "5m", "15m", "30m", "1h", "4h", "1D", "1W"] as const).map(technicalTimeframeWeight))
      .toEqual([0.5, 0.65, 0.8, 0.9, 1, 1.3, 1.7, 2.1]);
  });

  it("never exposes an incomplete intraday or daily higher-timeframe candle", () => {
    const fourHour = [
      bar("2025-01-02T08:00:00.000Z", 100),
      bar("2025-01-02T12:00:00.000Z", 101),
    ];
    expect(completedTechnicalBarsAt(fourHour, "4h", "2025-01-02T15:59:59.000Z")).toHaveLength(1);
    expect(completedTechnicalBarsAt(fourHour, "4h", "2025-01-02T16:00:00.000Z")).toHaveLength(2);

    const daily = [bar("2025-01-01T14:30:00.000Z", 100), bar("2025-01-02T14:30:00.000Z", 500)];
    expect(completedTechnicalBarsAt(daily, "1D", "2025-01-02T20:59:00.000Z", { timeZone: "America/New_York" }))
      .toEqual([daily[0]]);
    expect(completedTechnicalBarsAt(daily, "1D", "2025-01-02T21:00:00.000Z", { timeZone: "America/New_York" }))
      .toEqual(daily);
  });

  it("keeps already-available market-structure output invariant under future mutation", () => {
    const prefix = series([100, 104, 110, 106, 102, 107, 115, 110, 105, 112, 121, 115, 109, 117, 126, 120, 114, 122, 130]);
    const expected = calculateMarketStructure(prefix, { minorWidth: 1, majorWidth: 2 });
    const future = series([1_000, 1, 2_000], Date.UTC(2025, 0, 3, 14, 30));
    expect(calculateMarketStructure([...prefix, ...future], { asOfIndex: prefix.length - 1, minorWidth: 1, majorWidth: 2 }))
      .toEqual(expected);
    expect(expected.swings.every((swing) => Date.parse(swing.confirmationTimestamp) >= Date.parse(swing.timestamp))).toBe(true);
  });

  it("accepts the exact 0.15% price divergence boundary but rejects a smaller move", () => {
    const exactSecondClose = 99.5 * 0.9985 + 0.5;
    const exactBars = series([105, 103, 100, 103, 106, 102, exactSecondClose, 102, 107]);
    const values = [55, 45, 25, 42, 55, 44, 35, 48, 60];
    expect(calculateDivergencesFromSeries(exactBars, values, "RSI", { pivotWidth: 1, alignmentTolerance: 0 }))
      .toHaveLength(1);
    const belowBars = series([105, 103, 100, 103, 106, 102, 99.86, 102, 107]);
    expect(calculateDivergencesFromSeries(belowBars, values, "RSI", { pivotWidth: 1, alignmentTolerance: 0 }))
      .toEqual([]);
  });

  it("requires completed opening-range bars and respects New York DST", () => {
    const rows = [
      bar("2025-03-07T14:30:00.000Z", 100),
      bar("2025-03-07T14:35:00.000Z", 101),
      bar("2025-03-10T13:30:00.000Z", 102),
      bar("2025-03-10T13:35:00.000Z", 103),
      bar("2025-03-10T13:40:00.000Z", 104),
      bar("2025-03-10T13:45:00.000Z", 105),
      bar("2025-03-10T13:50:00.000Z", 106),
      bar("2025-03-10T13:55:00.000Z", 107),
    ];
    const partial = calculateSessionAnalytics(rows, { timeframe: "5m", assetClass: "EQUITY", timeZone: "America/New_York", asOfTimestamp: "2025-03-10T13:44:59.000Z" });
    expect(partial).toMatchObject({ status: "AVAILABLE", sessionDate: "2025-03-10", openingRange15: null, openingRange30: null });
    const fifteen = calculateSessionAnalytics(rows, { timeframe: "5m", assetClass: "EQUITY", timeZone: "America/New_York", asOfTimestamp: "2025-03-10T13:45:00.000Z" });
    expect(fifteen.openingRange15).toEqual({ high: 104.5, low: 101.5 });
    expect(fifteen.openingRange30).toBeNull();
    const thirty = calculateSessionAnalytics(rows, { timeframe: "5m", assetClass: "EQUITY", timeZone: "America/New_York", asOfTimestamp: "2025-03-10T14:00:00.000Z" });
    expect(thirty.openingRange30).toEqual({ high: 107.5, low: 101.5 });
  });

  it("rejects session semantics for crypto and coarse candles", () => {
    const rows = series([100, 101, 102]);
    expect(calculateSessionAnalytics(rows, { timeframe: "5m", assetClass: "CRYPTO" })).toMatchObject({ status: "UNAVAILABLE", semantics: "CRYPTO_24_7" });
    expect(calculateSessionAnalytics(rows, { timeframe: "1h", assetClass: "EQUITY" })).toMatchObject({ status: "UNAVAILABLE", reason: "INTRADAY_RESOLUTION_REQUIRED" });
  });
});
