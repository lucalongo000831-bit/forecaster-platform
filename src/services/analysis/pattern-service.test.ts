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
vi.mock("./pattern-repository", () => ({
  loadPatternHistory: mocks.loadHistory,
  loadPatternHistoryLkg: mocks.loadLkg,
  loadPatternAnalysisSnapshot: mocks.loadAnalysis,
  persistPatternAnalysis: mocks.persistAnalysis,
  persistPatternHistory: mocks.persistHistory,
}));

import { getPatternAnalysis } from "./pattern-service";

const DAY_MS = 86_400_000;

function history(multiplier = 1, crypto = false): MarketChartPoint[] {
  const rows: MarketChartPoint[] = [];
  let price = 50 * multiplier;
  for (let date = new Date("2008-01-01T00:00:00.000Z"); rows.length < 3_000; date = new Date(date.getTime() + DAY_MS)) {
    if (!crypto && [0, 6].includes(date.getUTCDay())) continue;
    const open = price;
    price *= Math.exp(0.0002 + Math.sin(rows.length / 11) * 0.003);
    rows.push({ timestamp: date.toISOString(), open, high: Math.max(open, price) * 1.006, low: Math.min(open, price) * 0.994, close: price, adjustedClose: crypto ? undefined : price, volume: 100_000 });
  }
  return rows;
}

function snapshot(symbol: string, points: MarketChartPoint[], source = "database-provider", assetClass = "EQUITY") {
  return {
    status: "AVAILABLE",
    payload: {
      symbol,
      assetClass,
      provider: source,
      sourceTimestamp: points.at(-1)!.timestamp,
      fetchedAt: "2026-08-21T09:00:00.000Z",
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

describe("pattern service DB-first and LKG behavior", () => {
  it("uses symbol-isolated persisted history before any provider request", async () => {
    const histories = new Map([
      ["AAPL", snapshot("AAPL", history(1), "provider-a")],
      ["NVDA", snapshot("NVDA", history(2), "provider-b")],
    ]);
    mocks.loadHistory.mockImplementation(async (symbol: string) => histories.get(symbol) ?? null);

    const aapl = await getPatternAnalysis("AAPL", { lookback: "1M", minimumSimilarity: 0 });
    const nvda = await getPatternAnalysis("NVDA", { lookback: "1M", minimumSimilarity: 0 });

    expect(mocks.loadHistory.mock.calls.map(([symbol]) => symbol)).toEqual(["AAPL", "NVDA"]);
    expect(aapl.symbol).toBe("AAPL");
    expect(nvda.symbol).toBe("NVDA");
    expect(aapl.metadata.historyHash).not.toBe(nvda.metadata.historyHash);
    expect(aapl.metadata.provider).toBe("provider-a");
    expect(nvda.metadata.provider).toBe("provider-b");
    expect(mocks.providerChart).not.toHaveBeenCalled();
  });

  it("uses last-known-good history when the runtime provider fails", async () => {
    const points = history();
    mocks.loadHistory.mockResolvedValue(null);
    mocks.providerChart.mockRejectedValue(new Error("provider offline"));
    mocks.loadLkg.mockResolvedValue(snapshot("SPY", points, "lkg-provider", "ETF"));

    const result = await getPatternAnalysis("SPY", { assetClass: "ETF", lookback: "3M", minimumSimilarity: 0 });

    expect(result.metadata.source).toBe("database:lkg");
    expect(result.metadata.provider).toBe("lkg-provider");
    expect(mocks.structuredLog).toHaveBeenCalledWith("warn", "pattern.history.lkg", expect.objectContaining({ symbol: "SPY" }));
  });

  it("persists MAX history once and reuses it across lookbacks and reference dates", async () => {
    const points = history();
    let stored: ReturnType<typeof snapshot> | null = null;
    mocks.loadHistory.mockImplementation(async () => stored);
    mocks.providerChart.mockResolvedValue({
      data: { points, asOf: points.at(-1)!.timestamp },
      meta: { provider: "live-provider", sourceTimestamp: points.at(-1)!.timestamp, fetchedAt: "2026-08-21T09:00:00.000Z" },
    });
    mocks.persistHistory.mockImplementation(async (payload: { symbol: string; points: MarketChartPoint[] }) => { stored = snapshot(payload.symbol, payload.points, "live-provider"); });

    await getPatternAnalysis("QQQ", { assetClass: "ETF", lookback: "1M", minimumSimilarity: 0 });
    await getPatternAnalysis("QQQ", { assetClass: "ETF", lookback: "6M", referenceDate: points.at(-200)!.timestamp.slice(0, 10), minimumSimilarity: 0 });

    expect(mocks.providerChart).toHaveBeenCalledTimes(1);
    expect(mocks.providerChart).toHaveBeenCalledWith("QQQ", 25);
  });

  it("keys cached analyses by canonical reference, lookback, model and history hash", async () => {
    const points = history();
    mocks.loadHistory.mockResolvedValue(snapshot("MSFT", points));

    await getPatternAnalysis("MSFT", { referenceDate: points.at(-100)!.timestamp.slice(0, 10), lookback: "1M", minimumSimilarity: 0 });
    await getPatternAnalysis("MSFT", { referenceDate: points.at(-50)!.timestamp.slice(0, 10), lookback: "3M", minimumSimilarity: 0 });

    const keys = mocks.cacheGet.mock.calls.map(([key]) => String(key));
    expect(keys).toHaveLength(2);
    expect(keys[0]).not.toBe(keys[1]);
    expect(keys.every((key) => key.includes("pattern-v2.0.0"))).toBe(true);
  });
});
