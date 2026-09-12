import { beforeEach, describe, expect, it, vi } from "vitest";
import type { AssetIntelligenceReport } from "@/types";

const mocks = vi.hoisted(() => ({
  cacheGet: vi.fn(),
  cacheSet: vi.fn(),
  quote: vi.fn(),
  profile: vi.fn(),
  chart: vi.fn(),
  technical: vi.fn(),
  seasonality: vi.fn(),
  news: vi.fn(),
  forecast: vi.fn(),
  cryptoBundle: vi.fn(),
  etfBundle: vi.fn(),
  log: vi.fn(),
}));

vi.mock("@/lib/server/redis", () => ({ cacheGet: mocks.cacheGet, cacheSet: mocks.cacheSet }));
vi.mock("@/lib/server/logger", () => ({ structuredLog: mocks.log }));
vi.mock("@/providers", () => ({ financialProviderRouter: { quote: mocks.quote, profile: mocks.profile, analyticsChart: mocks.chart } }));
vi.mock("./technical-service", () => ({ getTechnicalAnalysis: mocks.technical }));
vi.mock("./seasonality-service", () => ({ getSeasonalityAnalysis: mocks.seasonality }));
vi.mock("@/services/intelligence/news-service", () => ({ getNewsIntelligence: mocks.news }));
vi.mock("./forecast-service", () => ({ getForecastAnalysis: mocks.forecast }));
vi.mock("@/services/financial/data-bundle-service", () => ({ getCryptoDataBundle: mocks.cryptoBundle, getEtfDataBundle: mocks.etfBundle }));

import { getAssetIntelligence } from "./asset-intelligence-service";

function quote(symbol = "SPY") {
  return {
    data: {
      symbol,
      name: symbol === "ETH-USD" ? "Ethereum USD" : "SPDR S&P 500 ETF Trust",
      exchange: symbol.endsWith("-USD") ? "CCC" : "NYSEArca",
      currency: "USD",
      quoteType: symbol.endsWith("-USD") ? "CRYPTOCURRENCY" : "ETF",
      price: 500,
      changePercent: 1,
      marketCap: null,
      volume: 1_000,
      marketState: "REGULAR",
    },
    meta: { provider: "yahoo", freshnessType: "REALTIME", sourceTimestamp: "2026-09-11T12:00:00.000Z" },
  };
}

function cachedReport(): AssetIntelligenceReport {
  return {
    kind: "ETF", symbol: "SPY", name: "SPDR S&P 500 ETF Trust", exchange: "NYSEArca", currency: "USD",
    price: 500, changePercent: 1, marketCap: null, volume: 1_000, marketState: "REGULAR", provider: "yahoo",
    freshnessType: "REALTIME", sourceTimestamp: "2026-09-11T12:00:00.000Z", technical: null,
    correlations: { bitcoin: null, nasdaq: null }, seasonality: null,
    sentiment: { score: null, positive: 0, neutral: 0, negative: 0, provider: null }, forecast: null,
    unavailable: [], calculatedAt: "2026-09-11T12:00:00.000Z",
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.useRealTimers();
  mocks.cacheGet.mockResolvedValue(null);
  mocks.cacheSet.mockResolvedValue(undefined);
  mocks.quote.mockResolvedValue(quote());
  mocks.profile.mockResolvedValue(null);
  for (const optional of [mocks.chart, mocks.technical, mocks.seasonality, mocks.news, mocks.forecast, mocks.cryptoBundle, mocks.etfBundle]) optional.mockRejectedValue(new Error("provider unavailable"));
});

describe("asset intelligence render fast path", () => {
  it("returns the cached last-known-good report without contacting providers", async () => {
    mocks.cacheGet.mockResolvedValue(cachedReport());

    const report = await getAssetIntelligence("SPY");

    expect(report?.symbol).toBe("SPY");
    expect(report?.freshnessType).toBe("CACHED");
    expect(mocks.quote).not.toHaveBeenCalled();
  });

  it("isolates secondary provider failures from the valid quote and page", async () => {
    const report = await getAssetIntelligence("SPY");

    expect(report).toMatchObject({ symbol: "SPY", kind: "ETF", price: 500 });
    expect(report?.technical).toBeNull();
    expect(report?.unavailable).toEqual(expect.arrayContaining([
      "Technical history is temporarily unavailable.",
      "Attributed news sentiment is temporarily unavailable.",
    ]));
    expect(mocks.cacheSet).toHaveBeenCalledTimes(1);
  });

  it("bounds hanging profile and secondary operations instead of blocking the route", async () => {
    vi.useFakeTimers();
    const never = new Promise<never>(() => undefined);
    mocks.profile.mockReturnValue(never);
    for (const optional of [mocks.chart, mocks.technical, mocks.seasonality, mocks.news, mocks.forecast, mocks.etfBundle]) optional.mockReturnValue(never);

    const pending = getAssetIntelligence("SPY-TIMEOUT");
    await vi.advanceTimersByTimeAsync(4_500);

    await expect(pending).resolves.toMatchObject({ kind: "ETF", price: 500 });
    expect(mocks.log).toHaveBeenCalledWith("warn", "asset-intelligence.secondary_unavailable", expect.objectContaining({ symbol: "SPY-TIMEOUT" }));
  });

  it("coalesces concurrent cold renders for the same symbol", async () => {
    let release!: (value: ReturnType<typeof quote>) => void;
    mocks.quote.mockReturnValue(new Promise((resolve) => { release = resolve; }));

    const first = getAssetIntelligence("SPY-SINGLE-FLIGHT");
    const second = getAssetIntelligence("SPY-SINGLE-FLIGHT");
    release(quote("SPY-SINGLE-FLIGHT"));

    const [left, right] = await Promise.all([first, second]);
    expect(left).toEqual(right);
    expect(mocks.quote).toHaveBeenCalledTimes(1);
  });
});
