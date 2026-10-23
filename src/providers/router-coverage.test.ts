import { describe, expect, it } from "vitest";
import type { MarketChartPoint } from "@/types";
import { historicalCoverageYears, technicalHistorySpansBounds } from "./router";

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
  it("continues fallback when an hourly crypto response ends overnight instead of near the requested boundary", () => {
    const bounds = { from: "2026-10-16T00:00:00Z", to: "2026-10-17T11:00:00Z" };
    expect(technicalHistorySpansBounds([point(bounds.from), point("2026-10-16T23:00:00Z")], "BTC-USD", "1h", bounds)).toBe(false);
  });
  it("accepts a continuous crypto response reaching within its actual interval", () => {
    const bounds = { from: "2026-10-16T00:00:00Z", to: "2026-10-17T11:00:00Z" };
    expect(technicalHistorySpansBounds([point(bounds.from), point("2026-10-17T10:00:00Z")], "BTC-USD", "1h", bounds)).toBe(true);
  });
  it("keeps the exchange-closure tolerance separate from 24/7 crypto", () => {
    const bounds = { from: "2026-10-16T13:30:00Z", to: "2026-10-17T11:00:00Z" };
    const observations = [point(bounds.from), point("2026-10-16T19:30:00Z")];
    expect(technicalHistorySpansBounds(observations, "NVDA", "1h", bounds)).toBe(true);
    expect(technicalHistorySpansBounds(observations, "ETH-USD", "1h", bounds)).toBe(false);
  });
});
