import { afterEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  cacheGet: vi.fn().mockResolvedValue(null),
  cacheSet: vi.fn().mockResolvedValue(undefined),
  quote: vi.fn(),
  profile: vi.fn(),
  slow: vi.fn(),
  log: vi.fn(),
}));

vi.mock("next/cache", () => ({ revalidateTag: vi.fn(), unstable_cache: (operation: () => unknown) => operation }));
vi.mock("@/lib/server/redis", () => ({
  cacheDelete: vi.fn(),
  cacheGet: mocks.cacheGet,
  cacheSet: mocks.cacheSet,
  withDistributedLock: (_key: string, _ttl: number, operation: () => unknown) => operation(),
}));
vi.mock("@/lib/server/logger", () => ({ structuredLog: mocks.log }));
vi.mock("@/providers", () => ({
  financialProviderRouter: {
    quote: mocks.quote,
    profile: mocks.profile,
    fundamentals: mocks.slow,
    statements: mocks.slow,
    analystConsensus: mocks.slow,
    peers: mocks.slow,
  },
}));
vi.mock("@/services/analysis/seasonality-service", () => ({ getSeasonalityAnalysis: mocks.slow }));
vi.mock("@/services/analysis/forecast-service", () => ({ getForecastAnalysis: mocks.slow }));
vi.mock("@/services/analysis/technical-service", () => ({ getTechnicalAnalysis: mocks.slow }));
vi.mock("@/services/calendar/calendar-service", () => ({ getMarketCalendar: mocks.slow }));
vi.mock("@/services/intelligence/news-service", () => ({ getNewsIntelligence: mocks.slow }));
vi.mock("@/services/financial/data-bundle-service", () => ({ getAnalysisDataBundle: mocks.slow }));
vi.mock("@/services/financial/currency-service", () => ({ convertHistoricalPeriods: mocks.slow }));
vi.mock("@/services/instruments/instrument-resolver", () => ({ resolveInstrument: vi.fn().mockResolvedValue(null) }));
vi.mock("@/providers/official/issuer-sources", () => ({ officialIssuerSources: vi.fn().mockReturnValue([]) }));
vi.mock("@/providers/official/document-adapter", () => ({ getOfficialAutomotiveMetrics: mocks.slow }));
vi.mock("./company-analysis-repository", () => ({
  loadLatestCompanyAnalysis: vi.fn().mockResolvedValue(null),
  persistCompanyAnalysis: vi.fn().mockResolvedValue(null),
}));

import { getCompanyIntelligence } from "./company-intelligence-service";

afterEach(() => {
  vi.useRealTimers();
  vi.clearAllMocks();
});

describe("company intelligence interactive render budget", () => {
  it("returns an honest quote-only report when secondary analysis hangs", async () => {
    vi.useFakeTimers();
    const never = new Promise<never>(() => undefined);
    mocks.slow.mockReturnValue(never);
    mocks.quote.mockResolvedValue({
      data: { symbol: "P0TEST", name: "P0 Test Corporation", exchange: "NASDAQ", currency: "USD", quoteType: "EQUITY", price: 125, changePercent: 1.25, marketCap: 1_000_000, marketState: "REGULAR" },
      meta: { provider: "yahoo", sourceTimestamp: "2026-09-11T12:00:00.000Z", freshnessType: "CACHED" },
    });
    mocks.profile.mockResolvedValue({
      data: { name: "P0 Test Corporation", exchange: "NASDAQ", quoteType: "EQUITY", sector: "Technology", industry: "Software" },
      meta: { provider: "yahoo" },
    });

    const pending = getCompanyIntelligence("P0TEST");
    await vi.advanceTimersByTimeAsync(4_500);
    const report = await pending;

    expect(report).toMatchObject({
      symbol: "P0TEST",
      applicable: true,
      currentPrice: 125,
      verdict: "INSUFFICIENT_DATA",
      confidence: "VERY_LOW",
    });
    expect(report.limitations[0]).toContain("interactive render budget");
    expect(mocks.cacheSet).toHaveBeenCalledWith(expect.stringContaining("company-intelligence"), report, 30);
  });
});
