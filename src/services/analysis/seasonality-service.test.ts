import { beforeEach, describe, expect, it, vi } from "vitest";
import type { MarketChartPoint } from "@/types";

const mocks = vi.hoisted(() => ({
  cacheGet: vi.fn(),
  cacheSet: vi.fn(),
  loadHistory: vi.fn(),
  loadLkg: vi.fn(),
  loadAnalysis: vi.fn(),
  persistAnalysis: vi.fn(),
  persistHistory: vi.fn(),
  providerChart: vi.fn(),
  resolveInstrument: vi.fn(),
  structuredLog: vi.fn(),
}));

vi.mock("@/lib/server/redis", () => ({ cacheGet: mocks.cacheGet, cacheSet: mocks.cacheSet, privacySafeKey: (value: string) => `safe:${value}` }));
vi.mock("@/lib/server/logger", () => ({ structuredLog: mocks.structuredLog }));
vi.mock("@/providers", () => ({ financialProviderRouter: { seasonalityChart: mocks.providerChart } }));
vi.mock("@/services/instruments/instrument-resolver", () => ({ resolveInstrument: mocks.resolveInstrument }));
vi.mock("./seasonality-repository", () => ({
  loadSeasonalityHistory: mocks.loadHistory,
  loadSeasonalityHistoryLkg: mocks.loadLkg,
  loadSeasonalityAnalysisSnapshot: mocks.loadAnalysis,
  persistSeasonalityAnalysis: mocks.persistAnalysis,
  persistSeasonalityHistory: mocks.persistHistory,
}));

import { getSeasonalityAnalysis } from "./seasonality-service";

const DAY_MS = 86_400_000;

function history(multiplier = 1): MarketChartPoint[] {
  const rows: MarketChartPoint[] = [];
  let price = 50 * multiplier;
  for (let date = new Date("2022-01-01T00:00:00.000Z"); date <= new Date("2025-08-14T00:00:00.000Z"); date = new Date(date.getTime() + DAY_MS)) {
    if ([0, 6].includes(date.getUTCDay())) continue;
    const open = price;
    price *= 1 + 0.0002 + Math.sin(date.getUTCDate() / 5) * 0.0007;
    rows.push({ timestamp: date.toISOString(), open, high: Math.max(open, price) * 1.003, low: Math.min(open, price) * 0.997, close: price, adjustedClose: price, volume: 100_000 });
  }
  return rows;
}

function snapshot(symbol: string, points: MarketChartPoint[], source = "database-provider") {
  return {
    status: "AVAILABLE",
    payload: {
      symbol,
      assetClass: "EQUITY",
      provider: source,
      sourceTimestamp: points.at(-1)!.timestamp,
      fetchedAt: "2025-08-14T12:00:00.000Z",
      selectionComplete: true,
      points,
    },
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.cacheGet.mockResolvedValue(null);
  mocks.cacheSet.mockResolvedValue(undefined);
  mocks.loadAnalysis.mockResolvedValue(null);
  mocks.persistAnalysis.mockResolvedValue(undefined);
  mocks.persistHistory.mockResolvedValue(undefined);
  mocks.resolveInstrument.mockResolvedValue({ kind: "EQUITY" });
});

describe("seasonality service resilience and cache isolation", () => {
  it("never reuses one symbol history for another symbol", async () => {
    const histories = new Map([
      ["AAPL", snapshot("AAPL", history(1), "provider-a")],
      ["NVDA", snapshot("NVDA", history(2), "provider-b")],
    ]);
    mocks.loadHistory.mockImplementation(async (symbol: string) => histories.get(symbol) ?? null);

    const aapl = await getSeasonalityAnalysis("AAPL", { windows: ["3Y"], now: new Date("2025-08-14T12:00:00.000Z") });
    const nvda = await getSeasonalityAnalysis("NVDA", { windows: ["3Y"], now: new Date("2025-08-14T12:00:00.000Z") });

    expect(mocks.loadHistory.mock.calls.map(([symbol]) => symbol)).toEqual(["AAPL", "NVDA"]);
    expect(aapl.symbol).toBe("AAPL");
    expect(nvda.symbol).toBe("NVDA");
    expect(aapl.historyHash).not.toBe(nvda.historyHash);
    expect(aapl.provider).toBe("provider-a");
    expect(nvda.provider).toBe("provider-b");
    expect(mocks.providerChart).not.toHaveBeenCalled();
  });

  it("uses the persisted last-known-good history when every runtime provider fails", async () => {
    const points = history();
    mocks.loadHistory.mockResolvedValue(null);
    mocks.providerChart.mockRejectedValue(new Error("provider offline"));
    mocks.loadLkg.mockResolvedValue(snapshot("SPY", points, "lkg-provider"));

    const result = await getSeasonalityAnalysis("SPY", { assetClass: "ETF", windows: ["3Y"], now: new Date("2025-08-14T12:00:00.000Z") });

    expect(result.source).toBe("database:lkg");
    expect(result.provider).toBe("lkg-provider");
    expect(result.observations).toBe(points.length);
    expect(mocks.structuredLog).toHaveBeenCalledWith("warn", "seasonality.history.lkg", expect.objectContaining({ symbol: "SPY" }));
  });

  it("does not repeat a MAX provider request after the fetched history is persisted", async () => {
    const points = history();
    let stored: ReturnType<typeof snapshot> | null = null;
    mocks.loadHistory.mockImplementation(async () => stored);
    mocks.providerChart.mockResolvedValue({
      data: { points, asOf: points.at(-1)!.timestamp },
      meta: { provider: "live-provider", sourceTimestamp: points.at(-1)!.timestamp, fetchedAt: "2025-08-14T12:00:00.000Z" },
    });
    mocks.persistHistory.mockImplementation(async (payload: { symbol: string; points: MarketChartPoint[] }) => { stored = snapshot(payload.symbol, payload.points, "live-provider"); });

    await getSeasonalityAnalysis("QQQ", { assetClass: "ETF", windows: ["3Y"], now: new Date("2025-08-14T12:00:00.000Z") });
    await getSeasonalityAnalysis("QQQ", { assetClass: "ETF", windows: ["5Y"], now: new Date("2025-08-14T12:00:00.000Z") });

    expect(mocks.providerChart).toHaveBeenCalledTimes(1);
    expect(mocks.providerChart).toHaveBeenCalledWith("QQQ", 25);
  });
});
