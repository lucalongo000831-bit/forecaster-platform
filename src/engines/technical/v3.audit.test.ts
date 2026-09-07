import { performance } from "node:perf_hooks";
import { describe, expect, it } from "vitest";
import type { MarketChartPoint, TechnicalTimeframe } from "@/types";
import { calculateVolumeProfile } from "./v2";
import { calculateMarketStructure, calculateMtfStructure, calculateMtfTechnicalLevels, calculateTechnicalConfluenceV2, calculateTechnicalDivergences } from "./v3";

function fixture(length: number, phase = 0): MarketChartPoint[] {
  return Array.from({ length }, (_, index) => {
    const close = 100 + index * 0.015 + Math.sin((index + phase) / 7) * 4 + Math.sin((index + phase) / 31) * 8;
    return { timestamp: new Date(Date.UTC(2020, 0, 1, 0, index * 5)).toISOString(), open: close - 0.15, high: close + 1.2, low: close - 1.1, close, volume: 1_000 + index % 17 * 19 };
  });
}

describe("Technical V3 final quantitative audit", () => {
  it("keeps BOS/CHOCH and divergence outputs prefix-only under hostile future mutation", () => {
    const prefix = fixture(420);
    const future = fixture(80, 20_000).map((bar, index) => ({ ...bar, timestamp: new Date(Date.UTC(2025, 0, 1, 0, index * 5)).toISOString(), open: 1_000 + index, high: 1_100 + index, low: 10 + index, close: index % 2 ? 1_050 : 20 }));
    expect(calculateMarketStructure([...prefix, ...future], { asOfIndex: prefix.length - 1 })).toEqual(calculateMarketStructure(prefix));
    expect(calculateTechnicalDivergences([...prefix, ...future], { asOfIndex: prefix.length - 1 })).toEqual(calculateTechnicalDivergences(prefix));
  });

  it("keeps every MTF level prefix-only and exposes documented source weights", () => {
    const prefixes = Object.fromEntries((["15m", "1h", "4h", "1D"] as TechnicalTimeframe[]).map((timeframe, index) => [timeframe, fixture(180, index * 3)]));
    const extended = Object.fromEntries(Object.entries(prefixes).map(([timeframe, rows]) => [timeframe, [...rows, ...fixture(30, 5_000).map((bar, index) => ({ ...bar, timestamp: new Date(Date.UTC(2026, 0, 1, index)).toISOString(), close: 900 + index, open: 900 + index, high: 950 + index, low: 850 + index }))]]));
    const asOf = Object.fromEntries(Object.keys(prefixes).map((timeframe) => [timeframe, 179]));
    expect(calculateMtfTechnicalLevels(extended, { asOf })).toEqual(calculateMtfTechnicalLevels(prefixes));
    expect(calculateMtfTechnicalLevels(prefixes).every((level) => level.timeframes.length === level.confluenceCount && level.higherTimeframeWeight > 0)).toBe(true);
  });

  it("returns descriptive confluence without recommendations or profit probabilities", () => {
    const bars = fixture(300);
    const structure = calculateMarketStructure(bars);
    const mtfInput = { "15m": bars, "1h": bars, "4h": bars, "1D": bars };
    const result = calculateTechnicalConfluenceV2({ bars, structure, mtfStructure: calculateMtfStructure(mtfInput), mtfLevels: calculateMtfTechnicalLevels(mtfInput), profile: calculateVolumeProfile(bars), divergences: calculateTechnicalDivergences(bars) });
    expect(result.modelVersion).toBe("technical-confluence-v2.0.0");
    expect(JSON.stringify(result)).not.toMatch(/STRONG BUY|STRONG SELL|PROBABILITY|EXPECTED RETURN|\bBUY\b|\bSELL\b/i);
  });

  it("benchmarks 5,000 bars and four timeframes below interactive-blocking bounds", () => {
    const bars = fixture(5_000);
    const startedStructure = performance.now();
    const structure = calculateMarketStructure(bars);
    const structureMs = performance.now() - startedStructure;
    const startedDivergence = performance.now();
    const divergences = calculateTechnicalDivergences(bars);
    const divergenceMs = performance.now() - startedDivergence;
    const mtf = { "15m": bars, "1h": bars, "4h": bars, "1D": bars };
    const startedMtf = performance.now();
    const levels = calculateMtfTechnicalLevels(mtf);
    const mtfMs = performance.now() - startedMtf;
    expect(structure.status).toBe("AVAILABLE");
    expect(divergences.status).toBe("AVAILABLE");
    expect(levels.length).toBeLessThanOrEqual(8);
    expect(structureMs).toBeLessThan(1_500);
    expect(divergenceMs).toBeLessThan(1_500);
    expect(mtfMs).toBeLessThan(3_000);
  });
});
