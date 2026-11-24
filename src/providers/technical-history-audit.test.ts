import { afterEach, describe, expect, it, vi } from "vitest";
import { FinancialProviderRouter } from "./router";
import { YahooMarketDataAdapter } from "./market-data/yahoo-adapter";
import { MassiveMarketDataAdapter } from "./market-data/massive-adapter";
import { FmpMarketDataAdapter } from "./market-data/fmp-adapter";
import { EodhdMarketDataAdapter } from "./market-data/eodhd-adapter";
import { providerResult } from "./metadata";
import type { MarketChartDto } from "@/types";

vi.mock("./cache", () => ({ providerCached: (_key: string, _policy: unknown, load: () => unknown) => load() }));
const wide = { from: "2025-01-01T00:00:00Z", to: "2026-01-01T00:00:00Z" };
const narrow = { from: "2025-12-01T00:00:00Z", to: wide.to };
function feed(symbol: string, interval: string, bounds: typeof wide) {
  return providerResult("yahoo", { symbol, interval, range: "1Y", currency: "USD", exchange: "NASDAQ", previousClose: null, isDelayed: true, source: "yahoo", points: [bounds.from, "2025-12-02T00:00:00Z", bounds.to].map((timestamp) => ({ timestamp, open: 10, high: 12, low: 9, close: 11, volume: 100 })) } as MarketChartDto, { freshness: "delayed" });
}
function configure() {
  vi.spyOn(MassiveMarketDataAdapter.prototype, "isConfigured").mockReturnValue(false);
  vi.spyOn(FmpMarketDataAdapter.prototype, "isConfigured").mockReturnValue(false);
  vi.spyOn(EodhdMarketDataAdapter.prototype, "isConfigured").mockReturnValue(false);
  vi.spyOn(YahooMarketDataAdapter.prototype, "isConfigured").mockReturnValue(true);
  return vi.spyOn(YahooMarketDataAdapter.prototype, "getHistoricalBars").mockImplementation(async (s, _r, i, b) => feed(s, i!, b!));
}
afterEach(() => { vi.restoreAllMocks(); vi.useRealTimers(); });
describe("independent V5 router audit", () => {
  it("reuses a fresh containing window on contraction, but not another interval, asset or expired window", async () => {
    vi.useFakeTimers(); vi.setSystemTime(new Date("2026-01-01T00:00Z"));
    const fetch = configure(); const router = new FinancialProviderRouter();
    await router.technicalHistory("NVDA", "1Y", "1d", wide);
    const contracted = await router.technicalHistory("NVDA", "1M", "1d", narrow);
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(contracted.meta.freshnessType).toBe("CACHED");
    expect(contracted.data.points.map((p) => Date.parse(p.timestamp))).toEqual([Date.parse("2025-12-02T00:00:00Z"), Date.parse(wide.to)]);
    await router.technicalHistory("AAPL", "1M", "1d", narrow);
    await router.technicalHistory("NVDA", "1M", "1wk", narrow);
    expect(fetch).toHaveBeenCalledTimes(3);
    vi.advanceTimersByTime(60_001);
    await router.technicalHistory("NVDA", "1M", "1d", narrow);
    expect(fetch).toHaveBeenCalledTimes(4);
  });
  it("rejects wrong-asset upstream history rather than rendering it under the requested label", async () => {
    const fetch = configure(); fetch.mockResolvedValue(feed("AAPL", "1d", wide));
    await expect(new FinancialProviderRouter().technicalHistory("NVDA", "1Y", "1d", wide)).rejects.toThrow();
  });
  it("shares an in-flight containing request instead of starting a second provider fetch", async () => {
    const fetch = configure(); let finish!: (value: ReturnType<typeof feed>) => void;
    fetch.mockImplementation(() => new Promise((resolve) => { finish = resolve; }));
    const router = new FinancialProviderRouter();
    const first = router.technicalHistory("NVDA", "1Y", "1d", wide);
    const second = router.technicalHistory("NVDA", "1M", "1d", narrow);
    expect(fetch).toHaveBeenCalledTimes(1); finish(feed("NVDA", "1d", wide));
    const [a, b] = await Promise.all([first, second]);
    expect(a.data.points).toHaveLength(3); expect(b.data.points).toHaveLength(2);
  });
  it("never relabels stale LKG data as a fresh CACHED containment hit", async () => {
    const fetch = configure(), value = feed("NVDA", "1d", wide);
    fetch.mockResolvedValue({ ...value, meta: { ...value.meta, freshness: "stale", freshnessType: "STALE" } });
    const router = new FinancialProviderRouter();
    const [a, b] = await Promise.all([router.technicalHistory("NVDA", "1Y", "1d", wide), router.technicalHistory("NVDA", "1M", "1d", narrow)]);
    expect(a.meta.freshnessType).toBe("STALE"); expect(b.meta.freshnessType).toBe("STALE"); expect(fetch).toHaveBeenCalledTimes(2);
  });
});
