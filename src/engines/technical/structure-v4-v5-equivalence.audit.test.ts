import { createHash } from "node:crypto";
import { mkdirSync, writeFileSync } from "node:fs";
import { afterAll, describe, expect, it } from "vitest";
import { calculateMarketStructure } from "./v3";
import { calculateTechnicalStructureV4 } from "./structure-v4";
import type { MarketChartPoint } from "@/types";
const records: unknown[] = [];
// Captured from the untouched V4 implementation at f26c4de BEFORE the
// allocation-only rewrite; these immutable hashes are not computed as oracles.
const golden: Record<string, string> = {
  "dense-1000": "7ad03e8159c96b597720c7fa9a530e7341bc173b9ff51fc1932bc0255e4323e0",
  "dense-2500": "543ce1108b86a10fb34f9a99144513930711207049c81a7ddeb4a86a84b7f551",
  "dense-5000": "70475ddd3831a6f3113395b76ca000f37cb0b4ecc42163f118a7a1fc905a9e1e",
  "dense-10000": "3a4b58222f1f61d9faa206ade160728084cd18b3bab0b245082376144619c1f3",
  "persistent-1000": "c501275103c71d24cedc9307ab195bedfa5282ca8fec5c171242e7499bf25599",
  "persistent-2500": "089d1b8f0dda8d25ba325d9ce2701af28eb40e85b4194d3f1ecc9bde8bfe0caa",
  "persistent-5000": "2d02124db4f27fe13758bd464d865151850d034ce7de6be98c8b63ea48fa8bd4",
  "persistent-10000": "09c488963598929a32d43ce673b8bf134feea1f9859c6c0484acefcc6c7a1a96",
};
afterAll(() => { mkdirSync("test-results", { recursive: true }); writeFileSync("test-results/technical-v5-structure-measurements.json", JSON.stringify(records, null, 2)); });

describe("immutable V4 output equivalence for V5 formula-preserving performance correction", () => {
  const cases = [1000, 2500, 5000, 10000].flatMap((count) => ["dense", "persistent"].map((mode) => ({ count, mode })));
  it.each(cases)("preserves every lifecycle field and event: $mode / $count bars", ({ count, mode }) => {
    const bars: MarketChartPoint[] = Array.from({ length: count }, (_, i) => {
      if (mode === "persistent") { const close = 50 + i * .25; return { timestamp: new Date(Date.UTC(1990, 0, 1) + i * 86400_000).toISOString(), open: close - .01, high: close + .05, low: close - .05, close, volume: 100 }; }
      const close = 50 + i * .04 + Math.sin(i / 3) * 8 + Math.cos(i * 1.4) * 2;
      return { timestamp: new Date(Date.UTC(1990, 0, 1) + i * 86400_000).toISOString(), open: close - (i % 11 === 0 ? 3 : .3), high: close + .8, low: close - 4, close, volume: 1000 + i % 19 * 100 };
    });
    const start = performance.now();
    const result = calculateTechnicalStructureV4(bars, calculateMarketStructure(bars));
    const hash = createHash("sha256").update(JSON.stringify(result)).digest("hex");
    records.push({ fixture: "V4 indexed rewrite, immutable f26c4de oracle", mode, count, ms: performance.now() - start, hash, zones: result.liquidityZones.length, fvg: result.fairValueGaps.length, events: result.timeline.length });
    expect(hash).toBe(golden[`${mode}-${count}`]);
  });
  it.each(Array.from({ length: 12 }, (_, seed) => seed))("agrees with a brute-force chronological fill oracle, fixture %i", (seed) => {
    const bars: MarketChartPoint[] = Array.from({ length: 120 }, (_, i) => {
      const close = 100 + Math.sin(i * (seed + 1) / 7) * 20 + i / 10;
      return { timestamp: new Date(Date.UTC(2025, 0, 1) + i * 86400_000).toISOString(), open: close, high: close + .2, low: close - .3, close, volume: 100 };
    });
    const expected = [];
    for (let i = 2; i < bars.length; i++) {
      const direction = bars[i - 2].high < bars[i].low ? "BULLISH" : bars[i - 2].low > bars[i].high ? "BEARISH" : null;
      if (!direction) continue;
      const low = direction === "BULLISH" ? bars[i - 2].high : bars[i].high, high = direction === "BULLISH" ? bars[i].low : bars[i - 2].low;
      let fill = 0, filledAt: string | null = null;
      for (let j = i + 1; j < bars.length; j++) {
        const fraction = direction === "BULLISH" ? (high - bars[j].low) / (high - low) : (bars[j].high - low) / (high - low);
        fill = Math.max(fill, Math.min(1, Math.max(0, fraction)));
        if (fill >= 1) { filledAt = bars[j].timestamp; break; }
      }
      expected.push({ direction, low, high, filledPercent: Math.round(fill * 100), filledAt });
    }
    expect(calculateTechnicalStructureV4(bars).fairValueGaps.map(({ direction, low, high, filledPercent, filledAt }) => ({ direction, low, high, filledPercent, filledAt }))).toEqual(expected);
  });
});
