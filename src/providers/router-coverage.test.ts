import { describe, expect, it } from "vitest";
import type { MarketChartPoint } from "@/types";
import { historicalCoverageYears } from "./router";

function point(timestamp: string): MarketChartPoint {
  return { timestamp, open: 100, high: 101, low: 99, close: 100, volume: 1_000 };
}

describe("coverage-aware technical history", () => {
  it("rejects a successful but truncated MAX series", () => {
    const coverage = historicalCoverageYears([point("2024-09-24T06:00:00.000Z"), point("2026-09-23T06:00:00.000Z")]);
    expect(coverage).toBeGreaterThan(1.9);
    expect(coverage).toBeLessThan(25 * 0.9);
  });

  it("recognizes a provider response with the required long history", () => {
    const coverage = historicalCoverageYears([point("1999-01-22T22:00:00.000Z"), point("2026-09-23T22:00:00.000Z")]);
    expect(coverage).toBeGreaterThanOrEqual(25 * 0.9);
  });

  it("treats invalid or single-point history as zero coverage", () => {
    expect(historicalCoverageYears([point("2026-09-23T22:00:00.000Z")])).toBe(0);
    expect(historicalCoverageYears([point("invalid"), point("2026-09-23T22:00:00.000Z")])).toBe(0);
  });
});
