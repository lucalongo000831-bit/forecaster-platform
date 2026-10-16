import { describe, expect, it } from "vitest";
import type { MarketChartPoint } from "@/types";
import { calculateMarketStructure } from "./v3";
import { calculateTechnicalStructureV4 } from "./structure-v4";
import { atrTrailingStop, directionalMovement, donchianChannels, movingAverageOnVisibleHistory, supertrend } from "./studies-v5";

describe("V5 calculation workload benchmark", () => {
  it.each([1000, 2500, 5000, 10000])("reports mean/p95/max for %i verified bars", (count) => {
    const bars: MarketChartPoint[] = Array.from({ length: count }, (_, i) => ({ timestamp: new Date(Date.UTC(1990, 0, 1) + i * 86_400_000).toISOString(), open: 100 + i / 100, high: 103 + i / 100, low: 98 + i / 100, close: 101 + i / 100 + Math.sin(i / 13), volume: 10000 + i }));
    const operation = () => {
      for (const kind of ["SMA", "SMMA", "EMA"] as const) movingAverageOnVisibleHistory(bars, bars, { id: kind, kind, period: 200, color: "#123456", enabled: true });
      supertrend(bars); directionalMovement(bars); donchianChannels(bars); atrTrailingStop(bars);
      calculateTechnicalStructureV4(bars, calculateMarketStructure(bars));
    };
    for (let i = 0; i < 3; i++) operation();
    const samples = Array.from({ length: 10 }, () => { const start = performance.now(); operation(); return performance.now() - start; }).sort((a, b) => a - b);
    const mean = samples.reduce((sum, value) => sum + value, 0) / samples.length;
    console.info(JSON.stringify({ benchmark: "technical-v5-studies-and-structure", bars: count, meanMs: +mean.toFixed(2), p95Ms: +samples[9].toFixed(2), maxMs: +samples[9].toFixed(2) }));
    expect(samples.every(Number.isFinite)).toBe(true);
  });
});
