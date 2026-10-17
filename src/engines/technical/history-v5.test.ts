import { describe, expect, it } from "vitest";
import type { MarketChartPoint } from "@/types";
import { historyCoverage, requestedHistoryBounds, resampleSessionBars } from "./history-v5";
import { resampleFourHourBars } from "./terminal";

const rows = (start: string, count: number, step = 30): MarketChartPoint[] => Array.from({ length: count }, (_, i) => ({ timestamp: new Date(Date.parse(start) + i * step * 60_000).toISOString(), open: 100 + i, high: 102 + i, low: 99 + i, close: 101 + i, volume: 10 }));
describe("V5 session integrity", () => {
  it("reproduces V4 losing the first regular-session 4h block and session tail", () => {
    const source = rows("2026-03-06T14:30:00Z", 7, 60);
    expect(resampleFourHourBars(source).some((bar) => bar.timestamp === source[0].timestamp)).toBe(false);
  });
  it.each(["2026-03-06T14:30:00Z", "2026-03-09T13:30:00Z"])("keeps both US session blocks across DST at %s", (start) => {
    const source = rows(start, 13);
    const result = resampleSessionBars(source, 240, 30, "NVDA", "NASDAQ");
    expect(result.bars).toHaveLength(2);
    expect(result.bars.map((bar) => bar.volume)).toEqual([80, 50]);
    expect(result.bars[0]).toMatchObject({ timestamp: new Date(start).toISOString(), open: 100, high: 109, low: 99, close: 108 });
    expect(result.bars[1]).toMatchObject({ open: 108, high: 114, low: 107, close: 113 });
    expect(result.missing).toEqual([]);
  });
  it("preserves a half-hour US closing candle in 1h", () => {
    expect(resampleSessionBars(rows("2026-03-09T13:30:00Z", 13), 60, 30, "AAPL", "NASDAQ").bars.map((bar) => bar.volume)).toEqual([20, 20, 20, 20, 20, 20, 10]);
  });
  it("preserves the official Thanksgiving early-close session without inventing a fourth hour", () => {
    const result = resampleSessionBars(rows("2025-11-28T14:30:00Z", 7), 240, 30, "NVDA", "NASDAQ");
    expect(result.bars).toHaveLength(1); expect(result.bars[0].volume).toBe(70); expect(result.missing).toEqual([]);
  });
  it("does not merge missing bars, overnight sessions or invent volume", () => {
    const source = rows("2026-03-09T13:30:00Z", 13).filter((_, i) => i !== 3);
    const result = resampleSessionBars([...source, ...rows("2026-03-10T13:30:00Z", 13)], 240, 30, "NVDA", "NASDAQ");
    expect(result.bars).toHaveLength(3); expect(result.missing).toHaveLength(1);
  });
  it("aligns Milan and 24/7 crypto independently", () => {
    expect(resampleSessionBars(rows("2026-03-30T07:00:00Z", 17), 240, 30, "STLAM.MI", "MIL").bars.map((bar) => bar.volume)).toEqual([80, 80, 10]);
    expect(resampleSessionBars(rows("2026-03-08T00:00:00Z", 24, 60), 240, 60, "BTC-USD", "CRYPTO").bars).toHaveLength(6);
  });
  it("bounds custom days, and does not certify sparse or stale series as complete", () => {
    const bounds = requestedHistoryBounds("CUSTOM", new Date("2026-03-10T20:00Z"), { from: "2026-03-09", to: "2026-03-09" });
    expect(bounds.from).toBe("2026-03-09T00:00:00.000Z");
    expect(bounds.to).toBe("2026-03-09T23:59:59.999Z");
    const gap = [{ from: bounds.from, to: bounds.to, reason: "Missing observations" }];
    expect(historyCoverage(rows("2026-03-09T13:30Z", 2), "1h", bounds, "yahoo", "CACHED", gap).coverageStatus).toBe("PARTIAL");
    expect(historyCoverage(rows("2026-03-09T13:30Z", 2), "1h", bounds, "yahoo", "STALE").coverageStatus).toBe("STALE");
  });
  it("detects a crypto gap crossing midnight rather than treating it as an exchange closure", () => {
    const source = [...rows("2026-03-09T22:00Z", 2, 60), ...rows("2026-03-10T02:00Z", 2, 60)];
    const result = historyCoverage(source, "1h", { from: source[0].timestamp, to: source.at(-1)!.timestamp }, "yahoo", "CACHED", [], [], true);
    expect(result.coverageStatus).toBe("PARTIAL"); expect(result.missingSegments).toHaveLength(1);
  });
  it("requires continuous crypto history to reach interval-sized boundaries, not four-day tolerance", () => {
    const source = rows("2026-03-09T00:00Z", 24, 60);
    expect(historyCoverage(source, "1h", { from: source[0].timestamp, to: "2026-03-11T00:00:00Z" }, "yahoo", "CACHED", [], [], true).coverageStatus).toBe("PARTIAL");
    expect(historyCoverage(source, "1h", { from: source[0].timestamp, to: "2026-03-10T00:00:00Z" }, "yahoo", "CACHED", [], [], true).coverageStatus).toBe("COMPLETE");
  });
});
