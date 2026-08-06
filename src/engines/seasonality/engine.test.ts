import { describe, expect, it } from "vitest";
import type { MarketChartPoint } from "@/types";
import { analyzeSeasonality } from "./engine";

function seasonalBars(years: number): MarketChartPoint[] {
  const result: MarketChartPoint[] = [];
  let price = 100;
  for (let year = 2020; year < 2020 + years; year += 1) {
    for (let month = 0; month < 12; month += 1) {
      for (const day of [2, 16, 27]) {
        const change = month === 0 ? 1.02 : month === 8 ? 0.98 : 1.003;
        price *= change;
        result.push({ timestamp: new Date(Date.UTC(year, month, day)).toISOString(), open: price / change, high: price * 1.01, low: price * 0.99, close: price, adjustedClose: price, volume: 1_000 });
      }
    }
  }
  return result;
}

describe("seasonality engine", () => {
  it("computes monthly statistics and percentiles from adjusted prices", () => {
    const result = analyzeSeasonality("ACME", seasonalBars(6), "5Y", "test");
    expect(result.monthly).toHaveLength(12);
    expect(result.monthly[0].mean).toBeGreaterThan(0);
    expect(result.monthly[8].mean).toBeLessThan(0);
    expect(result.monthly[0].observations).toBeGreaterThanOrEqual(5);
    expect(result.monthly[0].percentile50).toBeTypeOf("number");
  });

  it("marks one year as descriptive and statistically insufficient", () => {
    const result = analyzeSeasonality("ACME", seasonalBars(3), "1Y", "test");
    expect(result.descriptiveOnly).toBe(true);
    expect(result.quality).toBe("INSUFFICIENT");
    expect(result.monthly.every((bucket) => bucket.quality === "INSUFFICIENT")).toBe(true);
  });

  it("returns serializable grouped calendar statistics", () => {
    const result = analyzeSeasonality("ACME", seasonalBars(10), "10Y", "test");
    expect(result.weekday).toHaveLength(5);
    expect(result.weekOfYear).toHaveLength(53);
    expect(result.tradingProgress).toHaveLength(10);
    expect(JSON.stringify(result)).not.toContain("NaN");
  });
});
