import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mkdirSync, writeFileSync } from "node:fs";
import type { ChartRange, MarketChartPoint, TechnicalHistoricalRange, TechnicalTimeframe } from "@/types";
const mocks = vi.hoisted(() => ({ technicalHistory: vi.fn() }));
vi.mock("@/providers", () => ({ financialProviderRouter: mocks }));
import { getTechnicalChartDataset } from "./technical-chart-service";

const DAY = 86_400_000, NOW = Date.parse("2026-10-23T12:00:00Z"), IPO = Date.parse("2010-01-04T00:00:00Z");
const ranges: TechnicalHistoricalRange[] = ["1D", "5D", "1M", "3M", "6M", "YTD", "1Y", "3Y", "5Y", "10Y", "MAX", "CUSTOM"];
const intervals: TechnicalTimeframe[] = ["1m", "5m", "15m", "30m", "1h", "4h", "1D", "1W"];
const days: Record<string, number> = { "1D": 1, "5D": 5, "1M": 31, "3M": 92, "6M": 183, "1Y": 366, "3Y": 1096, "5Y": 1827, "10Y": 3653 };
const steps: Record<string, number> = { "1m": 60_000, "5m": 300_000, "15m": 900_000, "30m": 1800_000, "1h": 3600_000, "1d": DAY, "1wk": 7 * DAY };
const report: unknown[] = [];
// Independently generated bounded provider observations. No production range,
// aggregation or coverage helper is used as the expected-value oracle.
function observations(from: string, to: string, interval: string): MarketChartPoint[] {
  const step = steps[interval];
  const anchor = interval === "1wk" ? Date.parse("1970-01-05T00:00:00Z") : 0;
  const start = anchor + Math.ceil((Math.max(Date.parse(from), IPO) - anchor) / step) * step;
  const rows: MarketChartPoint[] = [];
  for (let t = start; t <= Date.parse(to); t += step) {
    const open = 100 + (t / step % 19);
    rows.push({ timestamp: new Date(t).toISOString(), open, high: open + 4, low: open - 3, close: open + 1, volume: 7 });
  }
  return rows;
}
beforeEach(() => {
  vi.useFakeTimers(); vi.setSystemTime(NOW); mocks.technicalHistory.mockReset();
  mocks.technicalHistory.mockImplementation(async (symbol, range, interval, bounds) => ({ meta: { provider: "yahoo", freshness: "cached", freshnessType: "CACHED" }, data: { symbol, range, interval, currency: "USD", exchange: "CRYPTO", points: observations(bounds.from, bounds.to, interval), isDelayed: true } }));
});
afterEach(() => vi.useRealTimers());
afterAll(() => { mkdirSync("test-results", { recursive: true }); writeFileSync("test-results/technical-v5-audit-matrix.json", JSON.stringify({ fixture: "bounded synthetic crypto, fixed clock; not live provider availability", total: report.length, rows: report }, null, 2)); });
describe("independent 96-case historical range / interval matrix", () => {
  for (const interval of intervals) for (const range of ranges) it(`${interval}/${range}`, async () => {
    const to = range === "CUSTOM" ? Date.parse("2026-10-21T23:59:59.999Z") : NOW;
    const from = range === "CUSTOM" ? Date.parse("2026-10-20T00:00:00Z") : range === "MAX" ? 0 : range === "YTD" ? Date.parse("2026-01-01T00:00:00Z") : to - days[range] * DAY;
    const intraday = !["1D", "1W"].includes(interval);
    const retention = interval === "1m" ? 7 : ["5m", "15m", "30m"].includes(interval) ? 59 : 729;
    const request = () => getTechnicalChartDataset("BTC-USD", interval, range === "CUSTOM" ? undefined : range as ChartRange, range === "CUSTOM" ? { from: "2026-10-20", to: "2026-10-21" } : undefined, 200);
    if (intraday && (NOW - from) / DAY > retention) {
      await expect(request()).rejects.toMatchObject({ status: 422 });
      expect(mocks.technicalHistory).not.toHaveBeenCalled();
      report.push({ interval, range, status: "UNAVAILABLE", reason: `${retention}-day intraday retention`, first: null, last: null, count: 0 }); return;
    }
    // Weekly 1D/5D can contain no native Monday observation, never a
    // fabricated daily replacement; service must honestly report no data.
    const sourceInterval = interval === "1D" ? "1d" : interval === "1W" ? "1wk" : interval === "4h" ? "1h" : interval;
    let expected = observations(new Date(from).toISOString(), new Date(to).toISOString(), sourceInterval);
    if (interval === "4h") {
      const blocks = new Map<number, MarketChartPoint[]>();
      // Include the constituents preceding a non-aligned display start.
      const raw = observations(new Date(Math.floor(from / (4 * 3600_000)) * 4 * 3600_000).toISOString(), new Date(to).toISOString(), "1h");
      for (const row of raw) { const t = Math.floor(Date.parse(row.timestamp) / (4 * 3600_000)) * 4 * 3600_000; blocks.set(t, [...(blocks.get(t) ?? []), row]); }
      expected = [...blocks].filter(([t, rows]) => t >= from && t + 4 * 3600_000 <= to && rows.length === 4).map(([t, rows]) => ({ timestamp: new Date(t).toISOString(), open: rows[0].open, high: Math.max(...rows.map((r) => r.high)), low: Math.min(...rows.map((r) => r.low)), close: rows[3].close, volume: 28 }));
    } else if (intraday) expected = expected.filter((row) => Date.parse(row.timestamp) + steps[sourceInterval] <= to);
    if (!expected.length) { await expect(request()).rejects.toMatchObject({ status: 404 }); report.push({ interval, range, status: "UNAVAILABLE", reason: "No native observation inside requested dates", count: 0 }); return; }
    const response = await request(), data = response.data;
    expect(data.bars).toEqual(expected);
    expect(data.timeframe).toBe(interval); expect(data.requestedRange).toBe(range);
    expect(data.historyStart).toBe(expected[0].timestamp); expect(data.historyEnd).toBe(expected.at(-1)!.timestamp);
    expect(data.coverage?.barCount).toBe(expected.length);
    expect(data.coverage?.requestedFrom).toBe(new Date(from).toISOString());
    expect(data.coverage?.requestedTo).toBe(new Date(to).toISOString());
    if (range === "MAX") expect(data.coverage?.coverageStatus).toBe("PARTIAL");
    if (["1D", "1W"].includes(interval) && Date.parse(expected.at(-1)!.timestamp) + (interval === "1D" ? DAY : 7 * DAY) > to) {
      expect(data.coverage?.coverageStatus).toBe("PARTIAL"); expect(data.rangeMessage).toContain("provisional");
    }
    expect(data.calculationBars!.every((bar) => Date.parse(bar.timestamp) <= to)).toBe(true);
    report.push({ interval, range, status: data.coverage?.coverageStatus === "COMPLETE" ? "SUPPORTED" : "PARTIAL", reason: data.rangeMessage ?? "Continuous verified fixture spans requested interval", first: data.historyStart, last: data.historyEnd, count: expected.length, sourceInterval, bounds: data.coverage });
  });
});
