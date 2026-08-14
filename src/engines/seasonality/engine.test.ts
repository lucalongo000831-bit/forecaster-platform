import { describe, expect, it } from "vitest";
import type { MarketChartPoint } from "@/types";
import { analyzeSeasonality, normalizeSeasonalityBars, presidentialCycleForYear, signedDirectionalScore } from "./engine";

const NOW = new Date("2025-07-15T12:00:00.000Z");

function dailyHistory(fromYear = 2015, to = NOW, crypto = false): MarketChartPoint[] {
  const result: MarketChartPoint[] = [];
  let price = 100;
  for (let date = new Date(Date.UTC(fromYear, 0, 1)); date <= to; date = new Date(date.getTime() + 86_400_000)) {
    if (!crypto && (date.getUTCDay() === 0 || date.getUTCDay() === 6)) continue;
    const month = date.getUTCMonth();
    const seasonal = month === 0 ? 0.0015 : month === 8 ? -0.001 : 0.00025;
    const wave = Math.sin((date.getUTCDate() + date.getUTCFullYear()) / 5) * 0.0004;
    const open = price;
    price *= 1 + seasonal + wave;
    result.push({ timestamp: date.toISOString(), open, high: Math.max(open, price) * 1.004, low: Math.min(open, price) * 0.996, close: price, adjustedClose: price, volume: 1_000_000 });
  }
  return result;
}

describe("seasonality V2 engine", () => {
  it("keeps the partial current year separate and never extends its curve", () => {
    const result = analyzeSeasonality("AAPL", dailyHistory(), { windows: ["5Y"], now: NOW }, "test");
    const current = result.curves.find((curve) => curve.id === "CURRENT")!;
    expect(result.availableHistory.completedYears).not.toContain(2025);
    expect(result.annualReturns).toHaveLength(10);
    expect(current.points.length).toBeGreaterThan(40);
    expect(current.points.length).toBeLessThan(1_000);
    expect(current.points.at(-1)!.progress).toBeLessThan(1);
  });

  it("normalizes every available historical curve to exactly 1,000 points", () => {
    const result = analyzeSeasonality("AAPL", dailyHistory(), { windows: ["3Y", "5Y", "10Y"], now: NOW }, "test");
    for (const curve of result.curves.filter((curve) => curve.type === "HISTORICAL_WINDOW")) {
      expect(curve.available).toBe(true);
      expect(curve.points).toHaveLength(1_000);
      expect(curve.medianPoints).toHaveLength(1_000);
    }
  });

  it("marks a requested window unavailable instead of fabricating missing years", () => {
    const result = analyzeSeasonality("AAPL", dailyHistory(2021), { windows: ["3Y", "10Y", "25Y"], now: NOW }, "test");
    expect(result.curves.find((curve) => curve.id === "3Y")?.available).toBe(true);
    expect(result.curves.find((curve) => curve.id === "10Y")?.status).toBe("INSUFFICIENT_HISTORY");
    expect(result.curves.find((curve) => curve.id === "25Y")?.points).toHaveLength(0);
  });

  it("computes correlation only on the observed YTD segment without look-ahead", () => {
    const result = analyzeSeasonality("NVDA", dailyHistory(), { windows: ["5Y"], now: NOW, includeCorrelations: true }, "test");
    const currentLength = result.curves.find((curve) => curve.id === "CURRENT")!.points.length;
    const correlation = result.curves.find((curve) => curve.id === "5Y")!.correlation!;
    expect(correlation.status).toBe("AVAILABLE");
    expect(correlation.sampleSize).toBe(currentLength);
    expect(result.bestCorrelatedYear.year).toBeLessThan(2025);
    expect(result.bestCorrelatedYear.correlation.sampleSize).toBe(currentLength);
  });

  it("classifies the four US presidential-cycle years deterministically", () => {
    expect(presidentialCycleForYear(2024)).toBe("ELECTION");
    expect(presidentialCycleForYear(2025)).toBe("POST_ELECTION");
    expect(presidentialCycleForYear(2026)).toBe("MIDTERM");
    expect(presidentialCycleForYear(2027)).toBe("PRE_ELECTION");
  });

  it("excludes the current incomplete month from monthly historical summaries", () => {
    const result = analyzeSeasonality("MSFT", dailyHistory(), { windows: ["10Y"], now: NOW }, "test");
    expect(result.monthly[6].observations).toBe(10);
    const currentJuly = result.monthlyMatrix!.rows.find((row) => row.year === 2025)!.cells[6];
    expect(currentJuly.status).toBe("IN_PROGRESS");
    expect(currentJuly.returnPct).toBeTypeOf("number");
  });

  it("calculates monthly probability, average and median from completed years", () => {
    const result = analyzeSeasonality("SPY", dailyHistory(), { windows: ["10Y"], now: NOW }, "test");
    const january = result.monthlyMatrix!.summary[0];
    expect(january.observations).toBe(10);
    expect(january.probability).toBeGreaterThan(50);
    expect(january.averageReturn).toBeGreaterThan(0);
    expect(january.medianReturn).toBeGreaterThan(0);
  });

  it("produces signed directional scores bounded to -100..100", () => {
    expect(signedDirectionalScore([1, 2, 3, -1])).toBe(75);
    expect(signedDirectionalScore([-1, -2, -3, 1])).toBe(-75);
    expect(signedDirectionalScore([1, -1])).toBe(0);
    expect(Math.abs(signedDirectionalScore([100, 100])!)).toBeLessThanOrEqual(100);
  });

  it("uses the same signed hit-rate formula for daily, weekday and monthly series", () => {
    const result = analyzeSeasonality("AAPL", dailyHistory(), { windows: ["5Y"], selectedMonth: 1, now: NOW }, "test");
    const daily = result.directional.daily.find((series) => series.seriesId === "5Y")!;
    const weekly = result.directional.weekly.find((series) => series.seriesId === "5Y")!;
    const monthly = result.directional.monthly.find((series) => series.seriesId === "5Y")!;
    expect(daily.buckets.some((bucket) => bucket.score !== null)).toBe(true);
    expect(weekly.buckets.map((bucket) => bucket.label)).toEqual(["Mon", "Tue", "Wed", "Thu", "Fri"]);
    expect(monthly.buckets).toHaveLength(12);
    for (const bucket of [...daily.buckets, ...weekly.buckets, ...monthly.buckets]) if (bucket.score !== null) expect(bucket.score === 0 || Math.abs(bucket.score) >= 50).toBe(true);
  });

  it("maps weekend range boundaries to the nearest valid equity sessions", () => {
    const result = analyzeSeasonality("AAPL", dailyHistory(), { windows: ["5Y"], now: NOW, rangeStart: "01-06", rangeEnd: "01-14" }, "test");
    const trades = result.tradeRange!.statistics.find((item) => item.seriesId === "5Y")!.trades;
    expect(trades).toHaveLength(5);
    expect(trades.every((trade) => new Date(`${trade.openDate}T00:00:00Z`).getUTCDay() !== 0 && new Date(`${trade.openDate}T00:00:00Z`).getUTCDay() !== 6)).toBe(true);
    expect(trades.every((trade) => new Date(`${trade.closeDate}T00:00:00Z`).getUTCDay() !== 0 && new Date(`${trade.closeDate}T00:00:00Z`).getUTCDay() !== 6)).toBe(true);
  });

  it("supports cross-year LONG and SHORT ranges with excursion statistics", () => {
    const long = analyzeSeasonality("QQQ", dailyHistory(), { windows: ["5Y"], now: NOW, rangeStart: "11-15", rangeEnd: "02-15", side: "LONG" }, "test");
    const short = analyzeSeasonality("QQQ", dailyHistory(), { windows: ["5Y"], now: NOW, rangeStart: "11-15", rangeEnd: "02-15", side: "SHORT" }, "test");
    const longStats = long.tradeRange!.statistics.find((item) => item.seriesId === "5Y")!;
    const shortStats = short.tradeRange!.statistics.find((item) => item.seriesId === "5Y")!;
    expect(long.tradeRange!.crossesYear).toBe(true);
    expect(longStats.observations).toBeGreaterThan(0);
    expect(shortStats.trades[0].returnPct).toBeCloseTo(-longStats.trades[0].returnPct, 8);
    expect(longStats.trades[0].maxDropPct).toBeLessThanOrEqual(0);
    expect(longStats.trades[0].maxRisePct).toBeGreaterThanOrEqual(0);
  });

  it("retains crypto weekend bars and uses raw OHLC without equity adjustment", () => {
    const input = dailyHistory(2024, new Date("2025-01-15T00:00:00Z"), true);
    const normalized = normalizeSeasonalityBars(input, "CRYPTO");
    expect(normalized.some((bar) => bar.weekday === 0)).toBe(true);
    expect(normalized.some((bar) => bar.weekday === 6)).toBe(true);
    expect(normalized.every((bar) => bar.adjustmentFactor === 1)).toBe(true);
  });

  it("applies adjusted-close factors consistently to all equity OHLC fields", () => {
    const normalized = normalizeSeasonalityBars([
      { timestamp: "2024-01-02T00:00:00Z", open: 198, high: 202, low: 196, close: 200, adjustedClose: 100, volume: 10 },
      { timestamp: "2024-01-03T00:00:00Z", open: 101, high: 103, low: 99, close: 102, adjustedClose: 102, volume: 10 },
    ], "EQUITY");
    expect(normalized[0].adjustmentFactor).toBe(0.5);
    expect(normalized[0].adjustedOpen).toBe(99);
    expect(normalized[0].adjustedHigh).toBe(101);
    expect(normalized[0].adjustedLow).toBe(98);
    expect(normalized[0].adjustedClose).toBe(100);
  });

  it("does not create a false split crash in an adjusted equity curve", () => {
    const splitBars: MarketChartPoint[] = [
      { timestamp: "2023-01-02T00:00:00Z", open: 198, high: 202, low: 196, close: 200, adjustedClose: 100, volume: 10 },
      { timestamp: "2023-01-03T00:00:00Z", open: 202, high: 204, low: 200, close: 204, adjustedClose: 102, volume: 10 },
      { timestamp: "2023-01-04T00:00:00Z", open: 102, high: 104, low: 101, close: 103, adjustedClose: 103, volume: 10 },
      { timestamp: "2023-12-29T00:00:00Z", open: 108, high: 111, low: 107, close: 110, adjustedClose: 110, volume: 10 },
      ...dailyHistory(2024, NOW),
    ];
    const result = analyzeSeasonality("NVDA", splitBars, { windows: ["1Y"], now: NOW }, "test");
    const year2023 = result.bestCorrelatedYear.curve?.year === 2023 ? result.bestCorrelatedYear.curve : null;
    expect(normalizeSeasonalityBars(splitBars, "EQUITY").slice(0, 3).map((bar) => bar.adjustedClose)).toEqual([100, 102, 103]);
    expect(year2023?.points.every((point) => point.value > -50) ?? true).toBe(true);
  });

  it("returns fully serializable output with no NaN values", () => {
    const result = analyzeSeasonality("BTC-USD", dailyHistory(2018, NOW, true), { assetClass: "CRYPTO", windows: ["3Y", "5Y", "MAX"], now: NOW }, "test");
    expect(result.weekday).toHaveLength(7);
    expect(result.weekOfYear).toHaveLength(53);
    expect(result.tradingProgress).toHaveLength(10);
    expect(JSON.stringify(result)).not.toContain("NaN");
  });
});
