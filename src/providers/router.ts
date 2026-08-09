import "server-only";

import { structuredLog } from "@/lib/server/logger";
import { getServerEnvironment } from "@/schemas/env";
import { normalizeSearchQuery, normalizeSymbol } from "@/services/yahoo/symbol-resolver";
import { providerCached } from "./cache";
import { ProviderError } from "./errors";
import { providerResult } from "./metadata";
import { recordProviderDataTimestamp } from "./health";
import { FmpFundamentalsAdapter } from "./fundamentals/fmp-adapter";
import { YahooFundamentalsAdapter } from "./fundamentals/yahoo-adapter";
import { EodhdFundamentalsAdapter } from "./fundamentals/eodhd-adapter";
import { SecEdgarFundamentalsAdapter } from "./sec/edgar-adapter";
import { AlphaVantageNewsAdapter } from "./news/alpha-vantage-adapter";
import { FmpNewsAdapter } from "./news/fmp-adapter";
import { YahooNewsAdapter } from "./news/yahoo-adapter";
import { FmpPoliticalAdapter } from "./political/fmp-adapter";
import { FmpMacroAdapter } from "./macro/fmp-adapter";
import { AlphaVantageMacroAdapter } from "./macro/alpha-vantage-adapter";
import { FmpMarketDataAdapter } from "./market-data/fmp-adapter";
import { MassiveMarketDataAdapter } from "./market-data/massive-adapter";
import { YahooMarketDataAdapter } from "./market-data/yahoo-adapter";
import { EodhdMarketDataAdapter } from "./market-data/eodhd-adapter";
import { finnhubCompanyAdapter } from "./finnhub/company-adapter";
import type {
  FundamentalsProvider,
  MarketDataProvider,
  NewsProvider,
  MacroProvider,
  PoliticalProvider,
  ProviderCapability,
  ProviderName,
  ProviderResult,
  StatementKind,
  StatementPeriod,
} from "./types";
import type { ChartRange } from "@/types";

const marketAdapters = {
  massive: new MassiveMarketDataAdapter(),
  yahoo: new YahooMarketDataAdapter(),
  fmp: new FmpMarketDataAdapter(),
  eodhd: new EodhdMarketDataAdapter(),
} satisfies Record<"massive" | "yahoo" | "fmp" | "eodhd", MarketDataProvider>;
const fundamentalAdapters = { fmp: new FmpFundamentalsAdapter(), eodhd: new EodhdFundamentalsAdapter(), "sec-edgar": new SecEdgarFundamentalsAdapter(), yahoo: new YahooFundamentalsAdapter() } satisfies Record<"fmp" | "eodhd" | "sec-edgar" | "yahoo", FundamentalsProvider>;
const newsAdapters = { "alpha-vantage": new AlphaVantageNewsAdapter(), fmp: new FmpNewsAdapter(), yahoo: new YahooNewsAdapter() } satisfies Record<"alpha-vantage" | "fmp" | "yahoo", NewsProvider>;
const politicalAdapters = { fmp: new FmpPoliticalAdapter() } satisfies Record<"fmp", PoliticalProvider>;
const macroAdapters = { fmp: new FmpMacroAdapter(), "alpha-vantage": new AlphaVantageMacroAdapter() } satisfies Record<"fmp" | "alpha-vantage", MacroProvider>;
const capabilityBlocks = new Map<string, number>();

function unique<T>(values: T[]) { return [...new Set(values)]; }

async function firstAvailable<T>(operation: string, symbol: string | undefined, candidates: Array<{ name: ProviderName; configured: boolean; supported: boolean; task: () => Promise<ProviderResult<T>> }>) {
  const errors: ProviderError[] = [];
  for (let index = 0; index < candidates.length; index += 1) {
    const candidate = candidates[index];
    if (!candidate.configured || !candidate.supported) continue;
    const capabilityKey = `${candidate.name}:${operation}`;
    if ((capabilityBlocks.get(capabilityKey) ?? 0) > Date.now()) continue;
    try {
      const result = await candidate.task();
      recordProviderDataTimestamp(result.meta.provider, result.meta.sourceTimestamp);
      capabilityBlocks.delete(capabilityKey);
      return { ...result, meta: { ...result.meta, isFallback: index > 0 } };
    } catch (error) {
      const normalized = error instanceof ProviderError ? error : new ProviderError(candidate.name, "UPSTREAM_UNAVAILABLE", "Provider non disponibile.", true, 502, { cause: error });
      errors.push(normalized);
      if (normalized.code === "UNAUTHORIZED" || normalized.code === "PLAN_RESTRICTED") capabilityBlocks.set(capabilityKey, Date.now() + 60 * 60_000);
      structuredLog("warn", "provider.router.fallback", { provider: candidate.name, operation, symbol, code: normalized.code });
    }
  }
  const terminal = errors.find((error) => error.code === "NOT_FOUND") ?? errors.at(-1);
  throw terminal ?? new ProviderError("yahoo", "NOT_CONFIGURED", "Nessun provider configurato per questa operazione.", false, 503);
}

export class FinancialProviderRouter {
  private marketOrder(): MarketDataProvider[] {
    const env = getServerEnvironment();
    return unique([env.MARKET_DATA_PRIMARY_PROVIDER, env.MARKET_DATA_FALLBACK_PROVIDER, "yahoo", "fmp", "eodhd"] as const).map((name) => marketAdapters[name]);
  }
  private fundamentalOrder(): FundamentalsProvider[] {
    const env = getServerEnvironment();
    return unique([env.FUNDAMENTALS_PRIMARY_PROVIDER, "fmp", "eodhd", "sec-edgar", "yahoo"] as const).map((name) => fundamentalAdapters[name]);
  }
  private newsOrder(): NewsProvider[] {
    const env = getServerEnvironment();
    return unique([env.NEWS_PRIMARY_PROVIDER, "alpha-vantage", "fmp", "yahoo"] as const).map((name) => newsAdapters[name]);
  }

  search(queryInput: string) {
    const query = normalizeSearchQuery(queryInput);
    const order = [marketAdapters.fmp, marketAdapters.eodhd, marketAdapters.massive, marketAdapters.yahoo];
    return providerCached(`search:${query.toLowerCase()}`, { freshSeconds: 300, staleSeconds: 1_800 }, () => firstAvailable("search", undefined, order.map((adapter) => ({ name: adapter.name, configured: adapter.isConfigured(), supported: true, task: () => adapter.searchInstruments(query) }))));
  }

  quote(symbolInput: string) {
    const symbol = normalizeSymbol(symbolInput);
    const order = this.marketOrder();
    return providerCached(`quote:${symbol}`, { freshSeconds: 3, staleSeconds: 30 }, () => firstAvailable("quote", symbol, order.map((adapter) => ({ name: adapter.name, configured: adapter.isConfigured(), supported: adapter.supportsSymbol(symbol), task: () => adapter.getQuote(symbol) }))));
  }

  quotes(symbolInputs: string[]) {
    const symbols = unique(symbolInputs.map(normalizeSymbol)).slice(0, 50);
    return providerCached(`quotes:${symbols.join(",")}`, { freshSeconds: 15, staleSeconds: 60 }, async () => {
      const settled = await Promise.allSettled(symbols.map((symbol) => this.quote(symbol)));
      const results = settled.flatMap((result) => result.status === "fulfilled" ? [result.value] : []);
      if (!results.length) throw settled.find((result): result is PromiseRejectedResult => result.status === "rejected")?.reason ?? new ProviderError("yahoo", "NOT_FOUND", "Nessuna quotazione disponibile.", false, 404);
      const providers = unique(results.map((result) => result.meta.provider));
      const timestamps = results.map((result) => result.meta.sourceTimestamp).filter((value): value is string => Boolean(value)).sort();
      const freshnessTypes = results.map((result) => result.meta.freshnessType);
      const freshnessType = freshnessTypes.includes("STALE") ? "STALE" : freshnessTypes.includes("DELAYED") ? "DELAYED" : freshnessTypes.every((value) => value === "REALTIME") ? "REALTIME" : freshnessTypes.every((value) => value === "CACHED") ? "CACHED" : "NEAR_REALTIME";
      return providerResult(results[0]!.meta.provider, results.map((result) => result.data), { sourceTimestamp: timestamps.at(-1) ?? null, freshness: freshnessType === "STALE" ? "stale" : freshnessType === "CACHED" ? "cached" : freshnessType === "REALTIME" || freshnessType === "NEAR_REALTIME" ? "realtime" : "delayed", freshnessType, quality: results.length === symbols.length ? "verified" : "partial", isFallback: providers.length > 1 || results.some((result) => result.meta.isFallback) });
    });
  }

  chart(symbolInput: string, range: ChartRange, interval?: string | null) {
    const symbol = normalizeSymbol(symbolInput);
    const order = this.marketOrder();
    const intraday = range === "1D" || range === "5D";
    return providerCached(`chart:${symbol}:${range}:${interval ?? "auto"}`, { freshSeconds: intraday ? 10 : 900, staleSeconds: intraday ? 60 : 21_600 }, () => firstAvailable("chart", symbol, order.map((adapter) => ({ name: adapter.name, configured: adapter.isConfigured(), supported: adapter.supportsSymbol(symbol), task: () => adapter.getHistoricalBars(symbol, range, interval) }))));
  }

  analyticsChart(symbolInput: string, range: ChartRange = "MAX", interval: string | null = "1d") {
    const symbol = normalizeSymbol(symbolInput);
    const order = this.marketOrder();
    return providerCached(`analytics-chart:${symbol}:${range}:${interval ?? "auto"}`, { freshSeconds: 3_600, staleSeconds: 86_400 }, () => firstAvailable("analytics-chart", symbol, order.map((adapter) => ({ name: adapter.name, configured: adapter.isConfigured(), supported: adapter.supportsSymbol(symbol), task: () => adapter.getHistoricalBars(symbol, range, interval) }))));
  }

  marketStatus(market = "US") {
    const order = this.marketOrder();
    return providerCached(`market-status:${market}`, { freshSeconds: 30, staleSeconds: 300 }, () => firstAvailable("market-status", undefined, order.map((adapter) => ({ name: adapter.name, configured: adapter.isConfigured(), supported: true, task: () => adapter.getMarketStatus(market) }))));
  }

  profile(symbolInput: string) {
    const symbol = normalizeSymbol(symbolInput);
    const order = this.fundamentalOrder();
    return providerCached(`profile:${symbol}`, { freshSeconds: 86_400, staleSeconds: 604_800 }, () => firstAvailable("profile", symbol, order.map((adapter) => ({ name: adapter.name, configured: adapter.isConfigured(), supported: adapter.supportsSymbol(symbol), task: () => adapter.getCompanyProfile(symbol) }))));
  }

  fundamentals(symbolInput: string) {
    const symbol = normalizeSymbol(symbolInput);
    const order = this.fundamentalOrder();
    return providerCached(`fundamentals:${symbol}`, { freshSeconds: 21_600, staleSeconds: 172_800 }, () => firstAvailable("fundamentals", symbol, order.map((adapter) => ({ name: adapter.name, configured: adapter.isConfigured(), supported: adapter.supportsSymbol(symbol), task: () => adapter.getFundamentals(symbol) }))));
  }

  statements(symbolInput: string, kind: StatementKind, period: StatementPeriod, limit = 5) {
    const symbol = normalizeSymbol(symbolInput);
    const order = this.fundamentalOrder();
    return providerCached(`statements:${symbol}:${kind}:${period}:${limit}`, { freshSeconds: 21_600, staleSeconds: 604_800 }, () => firstAvailable("statements", symbol, order.map((adapter) => ({ name: adapter.name, configured: adapter.isConfigured(), supported: adapter.supportsSymbol(symbol), task: () => adapter.getStatements(symbol, kind, period, limit) }))));
  }

  ratios(symbolInput: string, period: StatementPeriod, limit = 5) {
    const symbol = normalizeSymbol(symbolInput);
    const order = this.fundamentalOrder();
    return providerCached(`ratios:${symbol}:${period}:${limit}`, { freshSeconds: 21_600, staleSeconds: 604_800 }, () => firstAvailable("ratios", symbol, order.map((adapter) => ({ name: adapter.name, configured: adapter.isConfigured(), supported: adapter.supportsSymbol(symbol), task: () => adapter.getRatios(symbol, period, limit) }))));
  }

  analystConsensus(symbolInput: string) {
    const symbol = normalizeSymbol(symbolInput);
    const order = this.fundamentalOrder();
    return providerCached(`analyst:${symbol}`, { freshSeconds: 21_600, staleSeconds: 172_800 }, () => firstAvailable("analyst", symbol, order.map((adapter) => ({ name: adapter.name, configured: adapter.isConfigured(), supported: adapter.supportsSymbol(symbol), task: () => adapter.getAnalystConsensus(symbol) }))));
  }

  analystEstimates(symbolInput: string, limit = 8) {
    const symbol = normalizeSymbol(symbolInput); const adapter = fundamentalAdapters.fmp;
    return providerCached(`analyst-estimates:${symbol}:${limit}`, { freshSeconds: 21_600, staleSeconds: 172_800 }, () => firstAvailable("analyst-estimates", symbol, [{ name: adapter.name, configured: adapter.isConfigured(), supported: adapter.supportsSymbol(symbol), task: () => adapter.getAnalystEstimates(symbol, limit) }]));
  }

  analystRatings(symbolInput: string) {
    const symbol = normalizeSymbol(symbolInput); const adapter = fundamentalAdapters.fmp;
    return providerCached(`analyst-ratings:${symbol}`, { freshSeconds: 21_600, staleSeconds: 172_800 }, () => firstAvailable("analyst-ratings", symbol, [{ name: adapter.name, configured: adapter.isConfigured(), supported: adapter.supportsSymbol(symbol), task: () => adapter.getAnalystRatings(symbol) }]));
  }

  growth(symbolInput: string, period: StatementPeriod = "annual", limit = 10) {
    const symbol = normalizeSymbol(symbolInput); const adapter = fundamentalAdapters.fmp;
    return providerCached(`growth:${symbol}:${period}:${limit}`, { freshSeconds: 21_600, staleSeconds: 604_800 }, () => firstAvailable("growth", symbol, [{ name: adapter.name, configured: adapter.isConfigured(), supported: adapter.supportsSymbol(symbol), task: () => adapter.getGrowth(symbol, period, limit) }]));
  }

  peers(symbolInput: string) {
    const symbol = normalizeSymbol(symbolInput); const adapter = fundamentalAdapters.fmp;
    return providerCached(`peers:${symbol}`, { freshSeconds: 86_400, staleSeconds: 604_800 }, () => firstAvailable("peers", symbol, [
      { name: adapter.name, configured: adapter.isConfigured(), supported: adapter.supportsSymbol(symbol), task: () => adapter.getPeers(symbol) },
      { name: finnhubCompanyAdapter.name, configured: finnhubCompanyAdapter.isConfigured(), supported: !symbol.startsWith("^") && !symbol.endsWith("-USD"), task: async () => providerResult("finnhub", await finnhubCompanyAdapter.getPeers(symbol), { freshness: "cached", freshnessType: "END_OF_DAY" }) },
    ]));
  }

  earningsCalendar(from: string, to: string, symbol?: string) {
    const normalized = symbol ? normalizeSymbol(symbol) : undefined;
    const order = this.fundamentalOrder();
    return providerCached(`earnings:${from}:${to}:${normalized ?? "all"}`, { freshSeconds: 3_600, staleSeconds: 21_600 }, () => firstAvailable("earnings-calendar", normalized, order.map((adapter) => ({ name: adapter.name, configured: adapter.isConfigured(), supported: !normalized || adapter.supportsSymbol(normalized), task: () => adapter.getEarningsCalendar(from, to, normalized) }))));
  }

  dividendCalendar(from: string, to: string, symbol?: string) {
    const normalized = symbol ? normalizeSymbol(symbol) : undefined;
    const order = this.fundamentalOrder();
    return providerCached(`dividends:${from}:${to}:${normalized ?? "all"}`, { freshSeconds: 7_200, staleSeconds: 86_400 }, () => firstAvailable("dividends-calendar", normalized, order.map((adapter) => ({ name: adapter.name, configured: adapter.isConfigured(), supported: !normalized || adapter.supportsSymbol(normalized), task: () => adapter.getDividendCalendar(from, to, normalized) }))));
  }

  economicCalendar(from: string, to: string) {
    const order = this.fundamentalOrder();
    return providerCached(`economic-calendar:${from}:${to}`, { freshSeconds: 600, staleSeconds: 3_600 }, () => firstAvailable("economic-calendar", undefined, order.map((adapter) => ({ name: adapter.name, configured: adapter.isConfigured(), supported: true, task: () => adapter.getEconomicCalendar(from, to) }))));
  }

  news(symbolInput: string, limit = 20) {
    const symbol = normalizeSymbol(symbolInput);
    const order = this.newsOrder();
    return providerCached(`news:${symbol}:${limit}`, { freshSeconds: 600, staleSeconds: 3_600 }, () => firstAvailable("news", symbol, order.map((adapter) => ({ name: adapter.name, configured: adapter.isConfigured(), supported: true, task: () => adapter.getTickerNews(symbol, limit) }))));
  }

  topicNews(topics: string[], limit = 20) {
    const order = this.newsOrder().filter((adapter) => adapter.name === "alpha-vantage" || adapter.name === "fmp");
    return providerCached(`topic-news:${topics.join(",")}:${limit}`, { freshSeconds: 900, staleSeconds: 3_600 }, () => firstAvailable("topic-news", undefined, order.map((adapter) => ({ name: adapter.name, configured: adapter.isConfigured(), supported: true, task: () => adapter.getTopicNews(topics, limit) }))));
  }

  senateTrades(symbolInput?: string, limit = 100) {
    const symbol = symbolInput ? normalizeSymbol(symbolInput) : undefined;
    const adapter = politicalAdapters.fmp;
    return providerCached(`political:senate:${symbol ?? "latest"}:${limit}`, { freshSeconds: 3_600, staleSeconds: 21_600 }, () => firstAvailable("senate-trades", symbol, [{ name: adapter.name, configured: adapter.isConfigured(), supported: true, task: () => adapter.getSenateTrades(symbol, limit) }]));
  }

  houseTrades(symbolInput?: string, limit = 100) {
    const symbol = symbolInput ? normalizeSymbol(symbolInput) : undefined;
    const adapter = politicalAdapters.fmp;
    return providerCached(`political:house:${symbol ?? "latest"}:${limit}`, { freshSeconds: 3_600, staleSeconds: 21_600 }, () => firstAvailable("house-trades", symbol, [{ name: adapter.name, configured: adapter.isConfigured(), supported: true, task: () => adapter.getHouseTrades(symbol, limit) }]));
  }

  macroIndicator(indicator: "INFLATION" | "RATES" | "GDP" | "EMPLOYMENT") {
    const order = [macroAdapters.fmp, macroAdapters["alpha-vantage"]];
    return providerCached(`macro:${indicator}`, { freshSeconds: 21_600, staleSeconds: 86_400 }, () => firstAvailable("macro-indicator", undefined, order.map((adapter) => ({ name: adapter.name, configured: adapter.isConfigured(), supported: true, task: () => adapter.getIndicator(indicator) }))));
  }

  capabilities(): ProviderCapability[] {
    return [
      { provider: "yahoo", configured: marketAdapters.yahoo.isConfigured(), capabilities: ["search", "quote", "historical-bars", "profile", "summary-fundamentals", "ticker-news", "global-symbols"], limitations: ["non-official API", "no historical statements in adapter", "quotes may be delayed"] },
      { provider: "fmp", configured: marketAdapters.fmp.isConfigured(), capabilities: ["profile", "statements", "ratios", "analyst-consensus", "earnings-calendar", "dividends-calendar", "economic-calendar", "house-disclosures", "senate-disclosures", "quote-fallback"], limitations: ["endpoint availability depends on subscription", "congressional disclosures may be delayed and amount-ranged", "daily fallback bars"] },
      { provider: "alpha-vantage", configured: newsAdapters["alpha-vantage"].isConfigured(), capabilities: ["ticker-news", "topic-news", "sentiment"], limitations: ["strict free-tier quotas", "coverage varies by symbol"] },
      { provider: "massive", configured: marketAdapters.massive.isConfigured(), capabilities: ["US snapshots", "US aggregate bars", "US market status", "US search"], limitations: ["US adapter only", "realtime depends on subscription", "5 calls/minute conservative limit"] },
    ];
  }
}

export const financialProviderRouter = new FinancialProviderRouter();

export class MarketDataRouter {
  getQuote(symbol: string) { return financialProviderRouter.quote(symbol); }
  getQuotes(symbols: string[]) { return financialProviderRouter.quotes(symbols); }
  getIntraday(symbol: string, range: ChartRange = "1D", interval?: string) { return financialProviderRouter.chart(symbol, range, interval); }
  getHistorical(symbol: string, range: ChartRange = "1Y", interval?: string) { return financialProviderRouter.chart(symbol, range, interval); }
  getAggregates(symbol: string, range: ChartRange = "1M", interval?: string) { return financialProviderRouter.chart(symbol, range, interval); }
  getMarketStatus(market?: string) { return financialProviderRouter.marketStatus(market); }
  search(query: string) { return financialProviderRouter.search(query); }
}
export class FundamentalsRouter {
  getProfile(symbol: string) { return financialProviderRouter.profile(symbol); }
  getFinancialStatements(symbol: string, kind: StatementKind, period: StatementPeriod, limit?: number) { return financialProviderRouter.statements(symbol, kind, period, limit); }
  getRatios(symbol: string, period: StatementPeriod, limit?: number) { return financialProviderRouter.ratios(symbol, period, limit); }
  getMetrics(symbol: string) { return financialProviderRouter.fundamentals(symbol); }
  getGrowth(symbol: string, period?: StatementPeriod, limit?: number) { return financialProviderRouter.growth(symbol, period, limit); }
  getAnalystEstimates(symbol: string, limit?: number) { return financialProviderRouter.analystEstimates(symbol, limit); }
  getAnalystRatings(symbol: string) { return financialProviderRouter.analystRatings(symbol); }
  getPriceTargets(symbol: string) { return financialProviderRouter.analystConsensus(symbol); }
  getPeers(symbol: string) { return financialProviderRouter.peers(symbol); }
}
export class CalendarRouter {
  getEarnings(from: string, to: string, symbol?: string) { return financialProviderRouter.earningsCalendar(from, to, symbol); }
  getDividends(from: string, to: string, symbol?: string) { return financialProviderRouter.dividendCalendar(from, to, symbol); }
  getEconomicEvents(from: string, to: string) { return financialProviderRouter.economicCalendar(from, to); }
}
export class NewsRouter {
  getTickerNews(symbol: string, limit?: number) { return financialProviderRouter.news(symbol, limit); }
  getMarketNews(topics = ["financial_markets"], limit?: number) { return financialProviderRouter.topicNews(topics, limit); }
  getSentiment(symbol: string, limit?: number) { return financialProviderRouter.news(symbol, limit); }
}
export class PoliticalRouter {
  getSenateTrades(symbol?: string, limit?: number) { return financialProviderRouter.senateTrades(symbol, limit); }
  getHouseTrades(symbol?: string, limit?: number) { return financialProviderRouter.houseTrades(symbol, limit); }
}
export class MacroRouter {
  getInflation() { return financialProviderRouter.macroIndicator("INFLATION"); }
  getRates() { return financialProviderRouter.macroIndicator("RATES"); }
  getGDP() { return financialProviderRouter.macroIndicator("GDP"); }
  getEmployment() { return financialProviderRouter.macroIndicator("EMPLOYMENT"); }
  getEconomicCalendar(from: string, to: string) { return financialProviderRouter.economicCalendar(from, to); }
}

export const marketDataRouter = new MarketDataRouter();
export const fundamentalsRouter = new FundamentalsRouter();
export const calendarRouter = new CalendarRouter();
export const newsRouter = new NewsRouter();
export const politicalRouter = new PoliticalRouter();
export const macroRouter = new MacroRouter();
