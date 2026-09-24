import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ChartRange, MarketChartPoint } from "@/types";

const mocks = vi.hoisted(() => ({ chart: vi.fn(), technicalChart: vi.fn(), resolveInstrument: vi.fn() }));

vi.mock("@/providers", () => ({ financialProviderRouter: { chart: mocks.chart, technicalChart: mocks.technicalChart } }));
vi.mock("@/services/instruments/instrument-resolver", () => ({ resolveInstrument: mocks.resolveInstrument }));

import { getTechnicalChartDataset } from "./technical-chart-service";

const points: MarketChartPoint[] = [
  { timestamp: "1999-01-22T22:00:00.000Z", open: 10, high: 11, low: 9, close: 10.5, adjustedClose: 10.5, volume: 1_000 },
  { timestamp: "2026-09-23T22:00:00.000Z", open: 200, high: 210, low: 195, close: 205, adjustedClose: 205, volume: 2_000 },
];

function result(range: ChartRange) {
  return {
    meta: { provider: "yahoo", sourceTimestamp: points.at(-1)!.timestamp, freshness: "delayed", freshnessType: "DELAYED", isFallback: true },
    data: { symbol: "NVDA", currency: "USD", exchange: "NASDAQ", range, interval: "1d", previousClose: 10.5, isDelayed: true, asOf: points.at(-1)!.timestamp, points, source: "yahoo" },
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.resolveInstrument.mockResolvedValue({ kind: "EQUITY" });
});

describe("Technical V4 long-history routing", () => {
  it.each([
    ["3Y", 3],
    ["5Y", 5],
    ["10Y", 10],
    ["MAX", 25],
  ] as const)("uses coverage-aware provider selection for %s", async (range, years) => {
    mocks.technicalChart.mockResolvedValue(result(range));
    const dataset = await getTechnicalChartDataset("NVDA", "1D", range);
    expect(mocks.technicalChart).toHaveBeenCalledWith("NVDA", range, "1d", years);
    expect(mocks.chart).not.toHaveBeenCalled();
    expect(dataset.data.requestedRange).toBe(range);
  });

  it("keeps ordinary ranges on the low-latency first-available route", async () => {
    mocks.chart.mockResolvedValue(result("1Y"));
    await getTechnicalChartDataset("NVDA", "1D", "1Y");
    expect(mocks.chart).toHaveBeenCalledWith("NVDA", "1Y", "1d");
    expect(mocks.technicalChart).not.toHaveBeenCalled();
  });
});
