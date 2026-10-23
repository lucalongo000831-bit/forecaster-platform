import { afterAll, describe, expect, it } from "vitest";
import { mkdirSync, writeFileSync } from "node:fs";
import { cpus, platform, arch } from "node:os";
import { calculateMarketStructure } from "./v3";
import { calculateTechnicalStructureV4 } from "./structure-v4";
import { sanitizeTechnicalBars } from "./terminal";
import { atrTrailingStop, directionalMovement, donchianChannels, movingAverageOnVisibleHistory, supertrend } from "./studies-v5";
import type { MarketChartPoint } from "@/types";
const report: unknown[] = [];
afterAll(() => { mkdirSync("test-results", { recursive: true }); writeFileSync("test-results/technical-v5-independent-benchmarks.json", JSON.stringify({ hardware: { cpu: cpus()[0]?.model, platform: platform(), arch: arch() }, fixture: "dense volatile confirmed daily observations; zero provider/network time; 3 warmups + 25 measurements per stage, p95 nearest-rank", rows: report }, null, 2)); });
describe("independent separated computation benchmarks", () => {
  const cases = [1000, 2500, 5000, 10000].flatMap((count) => (["history", "studies", "structure", "combined"] as const).map((stage) => ({ count, stage })));
  it.each(cases)("measures $stage independently on $count bars", ({ count, stage }) => {
    const bars: MarketChartPoint[] = Array.from({ length: count }, (_, i) => { const close = 100 + i / 100 + 8 * Math.sin(i * 1.3); return { timestamp: new Date(Date.UTC(1990, 0, 1) + i * 86_400_000).toISOString(), open: close - .5, high: close + 3, low: close - 2, close, volume: i % 7 ? 500 : 0 }; });
    const history = () => sanitizeTechnicalBars(bars);
    const studies = () => { for (const kind of ["SMA", "SMMA", "EMA"] as const) movingAverageOnVisibleHistory(bars, bars, { id: kind, kind, period: 200, color: "#123456", enabled: true }); supertrend(bars); directionalMovement(bars); donchianChannels(bars); atrTrailingStop(bars); };
    const structure = () => calculateTechnicalStructureV4(bars, calculateMarketStructure(bars));
    const workloads = { history, studies, structure, combined: () => { history(); studies(); structure(); } };
    const run = workloads[stage];
      for (let i = 0; i < 3; i++) run();
      const samples = Array.from({ length: 25 }, () => { const start = performance.now(); run(); return performance.now() - start; }).sort((a, b) => a - b);
      const row = { bars: count, stage, meanMs: samples.reduce((a, b) => a + b, 0) / samples.length, p95Ms: samples[Math.ceil(.95 * samples.length) - 1], maxMs: samples.at(-1) };
      expect(samples.every(Number.isFinite)).toBe(true); report.push(row);
  });
});
