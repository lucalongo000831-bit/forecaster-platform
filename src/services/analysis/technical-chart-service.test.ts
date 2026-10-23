import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { MarketChartPoint, TechnicalTimeframe } from "@/types";
const mocks = vi.hoisted(() => ({ technicalHistory: vi.fn() }));
vi.mock("@/providers", () => ({ financialProviderRouter: mocks }));
import { getTechnicalChartDataset } from "./technical-chart-service";
function series(from: string, to: string, interval: string): MarketChartPoint[] {
  const step = interval === "30m" ? 30 * 60_000 : interval === "1h" ? 3_600_000 : interval === "1wk" ? 7 * 86_400_000 : 86_400_000;
  const start = Math.max(Date.parse(from), Date.parse(to) - 366 * 86_400_000);
  return Array.from({ length: Math.floor((Date.parse(to) - start) / step) + 1 }, (_, i) => ({ timestamp: new Date(start + i * step).toISOString(), open: 100, high: 102, low: 99, close: 101, volume: 10 }));
}
beforeEach(() => {
  vi.useFakeTimers(); vi.setSystemTime(new Date("2026-09-24T20:00:00Z")); vi.clearAllMocks();
  mocks.technicalHistory.mockImplementation(async (symbol, range, interval, bounds) => ({
    meta: { provider: "yahoo", freshness: "delayed", freshnessType: "DELAYED" },
    data: { symbol, range, interval, exchange: symbol.endsWith("-USD") ? "CRYPTO" : "NASDAQ", currency: "USD", points: series(bounds.from, bounds.to, interval), isDelayed: true, asOf: bounds.to },
  }));
});
afterEach(() => vi.useRealTimers());
describe("Technical V5 interval/range contract", () => {
  const matrix: Array<[TechnicalTimeframe, string[]]> = [
    ["1h", ["1D", "5D", "1M", "3M", "6M", "1Y"]],
    ["4h", ["5D", "1M", "3M", "6M", "1Y"]],
    ["1D", ["1M", "3M", "6M", "1Y", "3Y", "5Y", "10Y", "MAX"]],
    ["1W", ["1Y", "3Y", "5Y", "10Y", "MAX"]],
  ];
  for (const [timeframe, ranges] of matrix) it.each(ranges)(`${timeframe} + %s retains the explicit interval and range`, async (range) => {
    const response = await getTechnicalChartDataset("BTC-USD", timeframe, range as Parameters<typeof getTechnicalChartDataset>[2]);
    expect(response.data.timeframe).toBe(timeframe);
    expect(response.data.requestedRange).toBe(range);
    expect(response.data.bars.every((bar) => bar.high >= Math.max(bar.open, bar.close) && bar.low <= Math.min(bar.open, bar.close))).toBe(true);
    expect(response.data.coverage?.barCount).toBe(response.data.bars.length);
    expect(response.data.calculationBars!.length).toBeGreaterThanOrEqual(response.data.bars.length);
    expect(mocks.technicalHistory.mock.calls[0][2]).toBe(timeframe === "4h" ? "1h" : timeframe === "1D" ? "1d" : timeframe === "1W" ? "1wk" : "1h");
  });
  it("rejects unsupported minute history without fabricating a daily replacement", async () => {
    await expect(getTechnicalChartDataset("NVDA", "1m", "1Y")).rejects.toThrow("RANGE_INTERVAL_UNAVAILABLE");
    expect(mocks.technicalHistory).not.toHaveBeenCalled();
  });
  it("uses half-hour constituents for session-aligned hourly equities", async () => {
    const response = await getTechnicalChartDataset("NVDA", "4h", "1M");
    expect(mocks.technicalHistory.mock.calls[0][2]).toBe("30m");
    expect(response.data.bars.every((bar) => [50, 80].includes(bar.volume))).toBe(true);
    expect(response.data.coverage?.coverageStatus).toBe("PARTIAL");
    expect(response.data.rangeMessage).toContain("complete session/holiday coverage is not independently certified");
  });
  it("marks actual truncated history as PARTIAL and never claims HTTP success means complete", async () => {
    const response = await getTechnicalChartDataset("NVDA", "1D", "10Y");
    expect(response.data.coverage?.coverageStatus).toBe("PARTIAL");
    expect(response.data.warmup?.status).toBe("LIMITED");
  });
});
