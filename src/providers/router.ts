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
import { BargoCongressAdapter } from "./political/bargo-adapter";
import { FmpMacroAdapter } from "./macro/fmp-adapter";
import { AlphaVantageMacroAdapter } from "./macro/alpha-vantage-adapter";
import { FmpMarketDataAdapter } from "./market-data/fmp-adapter";
import { MassiveMarketDataAdapter } from "./market-data/massive-adapter";
import { YahooMarketDataAdapter } from "./market-data/yahoo-adapter";
import { EodhdMarketDataAdapter } from "./market-data/eodhd-adapter";
import { finnhubCompanyAdapter } from "./finnhub/company-adapter";
import { yahooFinanceClient } from "@/services/yahoo/yahoo-finance-client";
import { deterministicE2EProvider } from "./testing/deterministic-e2e-provider";
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
import type { ChartRange, ResolvedInstrument } from "@/types";

const marketAdapters = {
  massive: new MassiveMarketDataAdapter(),
  yahoo: new YahooMarketDataAdapter(),
  fmp: new FmpMarketDataAdapter(),
  eodhd: new EodhdMarketDataAdapter(),
} satisfies Record<"massive" | "yahoo" | "fmp" | "eodhd", MarketDataProvider>;
const fundamentalAdapters = { fmp: new FmpFundamentalsAdapter(), eodhd: new EodhdFundamentalsAdapter(), "sec-edgar": new SecEdgarFundamentalsAdapter(), yahoo: new YahooFundamentalsAdapter() } satisfies Record<"fmp" | "eodhd" | "sec-edgar" | "yahoo", FundamentalsProvider>;
const newsAdapters = { "alpha-vantage": new AlphaVantageNewsAdapter(), fmp: new FmpNewsAdapter(), yahoo: new YahooNewsAdapter() } satisfies Record<"alpha-vantage" | "fmp" | "yahoo", NewsProvider>;
const politicalAdapters = { fmp: new FmpPoliticalAdapter(), bargo: new BargoCongressAdapter() } satisfies Record<"fmp" | "bargo", PoliticalProvider>;
const macroAdapters = { fmp: new FmpMacroAdapter(), "alpha-vantage": new AlphaVantageMacroAdapter() } satisfies Record<"fmp" | "alpha-vantage", MacroProvider>;
const capabilityBlocks = new Map<string, number>();

function unique<T>(values: T[]) { return [...new Set(values)]; }

function mappedSymbol(instrument: ResolvedInstrument, provider: ProviderName) {
  const candidates = instrument.mappings.filter((mapping) => mapping.provider === provider);
  return candidates.find((mapping) => mapping.providerInstrumentId?.startsWith("issuer-alias:"))?.symbol ?? candidates[0]?.symbol ?? instrument.canonicalSymbol;
}

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
    const fixture = deterministicE2EProvider(); if (fixture) return fixture.search(query);
    const order = [marketAdapters.fmp, marketAdapters.eodhd, marketAdapters.massive, marketAdapters.yahoo];
    return providerCached(`search:${query.toLowerCase()}`, { freshSeconds: 300, staleSeconds: 1_800 }, () => firstAvailable("search", undefined, order.map((adapter) => ({ name: adapter.name, configured: adapter.isConfigured(), supported: true, task: () => adapter.searchInstruments(query) }))));
  }

  quote(symbolInput: string) {
    const symbol = normalizeSymbol(symbolInput);
    const fixture = deterministicE2EProvider(); if (fixture) return fixture.quote(symbol);
    const order = this.marketOrder();
    return providerCached(`quote:${symbol}`, { freshSeconds: 3, staleSeconds: 30 }, () => firstAvailable("quote", symbol, order.map((adapter) => ({ name: adapter.name, configured: adapter.isConfigured(), supported: adapter.supportsSymbol(symbol), task: () => adapter.getQuote(symbol) }))));
  }

  quotes(symbolInputs: string[]) {
    const symbols = unique(symbolInputs.map(normalizeSymbol)).slice(0, 50);
    const fixture = deterministicE2EProvider(); if (fixture) return fixture.quotes(symbols);
    const order = unique([marketAdapters.yahoo, ...this.marketOrder()]);
    return providerCached(`quotes:${symbols.join(",")}`, { freshSeconds: 15, staleSeconds: 60 }, () => firstAvailable("quotes", undefined, order.map((adapter) => ({
      name: adapter.name,
      configured: adapter.isConfigured(),
      supported: symbols.every((symbol) => adapter.supportsSymbol(symbol)),
      task: () => adapter.getQuotes(symbols),
    }))));
  }

  chart(symbolInput: string, range: ChartRange, interval?: string | null) {
    const symbol = normalizeSymbol(symbolInput);
    const fixture = deterministicE2EProvider(); if (fixture) return fixture.chart(symbol, range, interval);
    const order = this.marketOrder();
    const intraday = range === "1D" || range === "5D";
    return providerCached(`chart:${symbol}:${range}:${interval ?? "auto"}`, { freshSeconds: intraday ? 10 : 900, staleSeconds: intraday ? 60 : 21_600 }, () => firstAvailable("chart", symbol, order.map((adapter) => ({ name: adapter.name, configured: adapter.isConfigured(), supported: adapter.supportsSymbol(symbol), task: () => adapter.getHistoricalBars(symbol, range, interval) }))));
  }

  analyticsChart(symbolInput: string, range: ChartRange = "MAX", interval: string | null = "1d") {
    const symbol = normalizeSymbol(symbolInput);
    const fixture = deterministicE2EProvider(); if (fixture) return fixture.chart(symbol, range, interval);
    const order = this.marketOrder();
    return providerCached(`analytics-chart:${symbol}:${range}:${interval ?? "auto"}`, { freshSeconds: 3_600, staleSeconds: 86_400 }, () => firstAvailable("analytics-chart", symbol, order.map((adapter) => ({ name: adapter.name, configured: adapter.isConfigured(), supported: adapter.supportsSymbol(symbol), task: () => adapter.getHistoricalBars(symbol, range, interval) }))));
  }

  seasonalityChart(symbolInput: string, preferredYears = 25) {
    const symbol = normalizeSymbol(symbolInput);
    const fixture = deterministicE2EProvider(); if (fixture) return fixture.chart(symbol, "MAX", "1d");
    const order = this.marketOrder();
    return providerCached(`seasonality-chart:v2:${symbol}:${preferredYears}`, { freshSeconds: 3_600, staleSeconds: 86_400 }, async () => {
      let best: Awaited<ReturnType<MarketDataProvider["getHistoricalBars"]>> | null = null;
      let lastError: unknown = null;
      for (let index = 0; index < order.length; index += 1) {
        const adapter = order[index];
        if (!adapter.isConfigured() || !adapter.supportsSymbol(symbol)) continue;
        try {
          const candidate = await adapter.getHistoricalBars(symbol, "MAX", "1d");
          if (candidate.data.points.length < 2) continue;
          if (!best || candidate.data.points.length > best.data.points.length) best = { ...candidate, meta: { ...candidate.meta, isFallback: index > 0 } };
          const first = Date.parse(candidate.data.points[0].timestamp);
          const last = Date.parse(candidate.data.points.at(-1)!.timestamp);
          const spanYears = Number.isFinite(first) && Number.isFinite(last) ? (last - first) / (365.2425 * 86_400_000) : 0;
          if (spanYears >= preferredYears) return { ...candidate, meta: { ...candidate.meta, isFallback: index > 0 } };
        } catch (error) {
          lastError = error;
          structuredLog("warn", "provider.router.seasonality.fallback", { provider: adapter.name, operation: "seasonality-chart", symbol, code: error instanceof ProviderError ? error.code : "UPSTREAM_UNAVAILABLE" });
        }
      }
      if (best) return best;
      throw lastError ?? new ProviderError("yahoo", "NOT_FOUND", "Storico daily non disponibile per Seasonality.", false, 404);
    });
  }

  marketStatus(market = "US") {
    const fixture = deterministicE2EProvider(); if (fixture) return fixture.marketStatus(market);
    const order = this.marketOrder();
    return providerCached(`market-status:${market}`, { freshSeconds: 30, staleSeconds: 300 }, () => firstAvailable("market-status", undefined, order.map((adapter) => ({ name: adapter.name, configured: adapter.isConfigured(), supported: true, task: () => adapter.getMarketStatus(market) }))));
  }

  profile(symbolInput: string) {
    const symbol = normalizeSymbol(symbolInput);
    const fixture = deterministicE2EProvider(); if (fixture) return fixture.profile(symbol);
    const order = this.fundamentalOrder();
    return providerCached(`profile:${symbol}`, { freshSeconds: 86_400, staleSeconds: 604_800 }, () => firstAvailable("profile", symbol, order.map((adapter) => ({ name: adapter.name, configured: adapter.isConfigured(), supported: adapter.supportsSymbol(symbol), task: () => adapter.getCompanyProfile(symbol) }))));
  }

  fundamentals(symbolInput: string) {
    const symbol = normalizeSymbol(symbolInput);
    const fixture = deterministicE2EProvider(); if (fixture) return fixture.fundamentals(symbol);
    const order = this.fundamentalOrder();
    return providerCached(`fundamentals:${symbol}`, { freshSeconds: 21_600, staleSeconds: 172_800 }, () => firstAvailable("fundamentals", symbol, order.map((adapter) => ({ name: adapter.name, configured: adapter.isConfigured(), supported: adapter.supportsSymbol(symbol), task: () => adapter.getFundamentals(symbol) }))));
  }

  fundamentalsForInstrument(instrument: ResolvedInstrument) {
    const fixture = deterministicE2EProvider(); if (fixture) return fixture.fundamentals(instrument.canonicalSymbol);
    const order = this.fundamentalOrder();
    const cacheIdentity = instrument.issuer?.cik ?? instrument.issuer?.lei ?? instrument.canonicalSymbol;
    return providerCached(`fundamentals:issuer:${cacheIdentity}`, { freshSeconds: 21_600, staleSeconds: 172_800 }, () => firstAvailable("fundamentals", instrument.canonicalSymbol, order.map((adapter) => {
      const symbol = mappedSymbol(instrument, adapter.name);
      return { name: adapter.name, configured: adapter.isConfigured(), supported: adapter.supportsSymbol(symbol), task: () => adapter.getFundamentals(symbol) };
    })));
  }

  supplementalFundamentalsForInstrument(instrument: ResolvedInstrument) {
    const fixture = deterministicE2EProvider(); if (fixture) return fixture.fundamentals(instrument.canonicalSymbol);
    const adapter = fundamentalAdapters.yahoo;
    const symbol = mappedSymbol(instrument, "yahoo");
    return providerCached(`fundamentals:supplemental:yahoo:${instrument.issuer?.cik ?? symbol}`, { freshSeconds: 21_600, staleSeconds: 172_800 }, () => firstAvailable("supplemental-fundamentals", symbol, [
      { name: adapter.name, configured: adapter.isConfigured(), supported: adapter.supportsSymbol(symbol), task: () => adapter.getFundamentals(symbol) },
    ]));
  }

  statements(symbolInput: string, kind: StatementKind, period: StatementPeriod, limit = 5) {
    const symbol = normalizeSymbol(symbolInput);
    const fixture = deterministicE2EProvider(); if (fixture) return fixture.statements(symbol, kind, period, limit);
    const order = this.fundamentalOrder();
    return providerCached(`statements:${symbol}:${kind}:${period}:${limit}`, { freshSeconds: 21_600, staleSeconds: 604_800 }, () => firstAvailable("statements", symbol, order.map((adapter) => ({ name: adapter.name, configured: adapter.isConfigured(), supported: adapter.supportsSymbol(symbol), task: () => adapter.getStatements(symbol, kind, period, limit) }))));
  }

  statementsForInstrument(instrument: ResolvedInstrument, kind: StatementKind, period: StatementPeriod, limit = 5) {
    const fixture = deterministicE2EProvider(); if (fixture) return fixture.statements(instrument.canonicalSymbol, kind, period, limit);
    const order = this.fundamentalOrder();
    const cacheIdentity = instrument.issuer?.cik ?? instrument.issuer?.lei ?? instrument.canonicalSymbol;
    return providerCached(`statements:issuer:${cacheIdentity}:${kind}:${period}:${limit}`, { freshSeconds: 21_600, staleSeconds: 604_800 }, async () => {
      const result = await firstAvailable("statements", instrument.canonicalSymbol, order.map((adapter) => {
        const symbol = mappedSymbol(instrument, adapter.name);
        return { name: adapter.name, configured: adapter.isConfigured(), supported: adapter.supportsSymbol(symbol), task: () => adapter.getStatements(symbol, kind, period, limit) };
      }));
      const comparableStart = instrument.issuer?.comparableHistoryStartDate;
      const data = comparableStart && period === "annual" ? result.data.filter((statement) => statement.fiscalDate >= comparableStart) : result.data;
      if (!data.length) throw new ProviderError(result.meta.provider, "NOT_FOUND", "Nessun periodo finanziario comparabile disponibile per l'issuer corrente.", false, 404);
      return { ...result, data };
    });
  }

  ratios(symbolInput: string, period: StatementPeriod, limit = 5) {
    const symbol = normalizeSymbol(symbolInput);
    const fixture = deterministicE2EProvider(); if (fixture) return fixture.ratios(symbol, period, limit);
    const order = this.fundamentalOrder();
    return providerCached(`ratios:${symbol}:${period}:${limit}`, { freshSeconds: 21_600, staleSeconds: 604_800 }, () => firstAvailable("ratios", symbol, order.map((adapter) => ({ name: adapter.name, configured: adapter.isConfigured(), supported: adapter.supportsSymbol(symbol), task: () => adapter.getRatios(symbol, period, limit) }))));
  }

  analystConsensus(symbolInput: string) {
    const symbol = normalizeSymbol(symbolInput);
    const fixture = deterministicE2EProvider(); if (fixture) return fixture.analystConsensus(symbol);
    const order = this.fundamentalOrder();
    return providerCached(`analyst:${symbol}`, { freshSeconds: 21_600, staleSeconds: 172_800 }, () => firstAvailable("analyst", symbol, order.map((adapter) => ({ name: adapter.name, configured: adapter.isConfigured(), supported: adapter.supportsSymbol(symbol), task: () => adapter.getAnalystConsensus(symbol) }))));
  }

  analystConsensusForInstrument(instrument: ResolvedInstrument) {
    const fixture = deterministicE2EProvider(); if (fixture) return fixture.analystConsensus(instrument.canonicalSymbol);
    const order = this.fundamentalOrder();
    return providerCached(`analyst:issuer:${instrument.issuer?.cik ?? instrument.canonicalSymbol}`, { freshSeconds: 21_600, staleSeconds: 172_800 }, () => firstAvailable("analyst", instrument.canonicalSymbol, order.map((adapter) => {
      const symbol = mappedSymbol(instrument, adapter.name);
      return { name: adapter.name, configured: adapter.isConfigured(), supported: adapter.supportsSymbol(symbol), task: () => adapter.getAnalystConsensus(symbol) };
    })));
  }

  analystEstimates(symbolInput: string, limit = 8) {
    const symbol = normalizeSymbol(symbolInput); const adapter = fundamentalAdapters.fmp;
    const fixture = deterministicE2EProvider(); if (fixture) return fixture.analystEstimates(symbol, limit);
    return providerCached(`analyst-estimates:${symbol}:${limit}`, { freshSeconds: 21_600, staleSeconds: 172_800 }, () => firstAvailable("analyst-estimates", symbol, [{ name: adapter.name, configured: adapter.isConfigured(), supported: adapter.supportsSymbol(symbol), task: () => adapter.getAnalystEstimates(symbol, limit) }]));
  }

  analystRatings(symbolInput: string) {
    const symbol = normalizeSymbol(symbolInput); const adapter = fundamentalAdapters.fmp;
    const fixture = deterministicE2EProvider(); if (fixture) return fixture.analystRatings(symbol);
    return providerCached(`analyst-ratings:${symbol}`, { freshSeconds: 21_600, staleSeconds: 172_800 }, () => firstAvailable("analyst-ratings", symbol, [{ name: adapter.name, configured: adapter.isConfigured(), supported: adapter.supportsSymbol(symbol), task: () => adapter.getAnalystRatings(symbol) }]));
  }

  growth(symbolInput: string, period: StatementPeriod = "annual", limit = 10) {
    const symbol = normalizeSymbol(symbolInput); const adapter = fundamentalAdapters.fmp;
    const fixture = deterministicE2EProvider(); if (fixture) return fixture.growth(symbol, period, limit);
    return providerCached(`growth:${symbol}:${period}:${limit}`, { freshSeconds: 21_600, staleSeconds: 604_800 }, () => firstAvailable("growth", symbol, [{ name: adapter.name, configured: adapter.isConfigured(), supported: adapter.supportsSymbol(symbol), task: () => adapter.getGrowth(symbol, period, limit) }]));
  }

  peers(symbolInput: string) {
    const symbol = normalizeSymbol(symbolInput); const adapter = fundamentalAdapters.fmp;
    const fixture = deterministicE2EProvider(); if (fixture) return fixture.peers(symbol);
    return providerCached(`peers:${symbol}`, { freshSeconds: 86_400, staleSeconds: 604_800 }, () => firstAvailable("peers", symbol, [
      { name: adapter.name, configured: adapter.isConfigured(), supported: adapter.supportsSymbol(symbol), task: () => adapter.getPeers(symbol) },
      { name: finnhubCompanyAdapter.name, configured: finnhubCompanyAdapter.isConfigured(), supported: !symbol.startsWith("^") && !symbol.endsWith("-USD"), task: async () => providerResult("finnhub", await finnhubCompanyAdapter.getPeers(symbol), { freshness: "cached", freshnessType: "END_OF_DAY" }) },
      { name: "yahoo", configured: fundamentalAdapters.yahoo.isConfigured(), supported: fundamentalAdapters.yahoo.supportsSymbol(symbol), task: async () => providerResult("yahoo", await yahooFinanceClient.relatedSymbols(symbol), { freshness: "cached", freshnessType: "END_OF_DAY", quality: "partial" }) },
    ]));
  }

  peersForInstrument(instrument: ResolvedInstrument) {
    const fixture = deterministicE2EProvider(); if (fixture) return fixture.peers(instrument.canonicalSymbol);
    const fmp = fundamentalAdapters.fmp;
    const fmpSymbol = mappedSymbol(instrument, "fmp");
    const finnhubSymbol = mappedSymbol(instrument, "finnhub");
    return providerCached(`peers:issuer:${instrument.issuer?.cik ?? instrument.canonicalSymbol}`, { freshSeconds: 86_400, staleSeconds: 604_800 }, async () => {
      const issuerListings = new Set([instrument.canonicalSymbol, ...instrument.mappings.map((mapping) => mapping.symbol), ...(instrument.listings?.flatMap((listing) => [listing.symbol, listing.providerSymbol]) ?? [])].map((value) => value.toUpperCase()));
      const economicPeers = <T extends ProviderResult<string[]>>(result: T) => {
        const data = result.data.filter((symbol) => !issuerListings.has(symbol.toUpperCase()));
        if (!data.length) throw new ProviderError(result.meta.provider, "NOT_FOUND", "Il provider ha restituito soltanto listing dello stesso issuer, non peer economici.", false, 404);
        return { ...result, data };
      };
      return firstAvailable("peers", instrument.canonicalSymbol, [
        { name: fmp.name, configured: fmp.isConfigured(), supported: fmp.supportsSymbol(fmpSymbol), task: async () => economicPeers(await fmp.getPeers(fmpSymbol)) },
        { name: finnhubCompanyAdapter.name, configured: finnhubCompanyAdapter.isConfigured(), supported: !finnhubSymbol.startsWith("^") && !finnhubSymbol.endsWith("-USD"), task: async () => economicPeers(providerResult("finnhub", await finnhubCompanyAdapter.getPeers(finnhubSymbol), { freshness: "cached", freshnessType: "END_OF_DAY" })) },
        { name: "yahoo", configured: fundamentalAdapters.yahoo.isConfigured(), supported: fundamentalAdapters.yahoo.supportsSymbol(mappedSymbol(instrument, "yahoo")), task: async () => economicPeers(providerResult("yahoo", await yahooFinanceClient.relatedSymbols(mappedSymbol(instrument, "yahoo")), { freshness: "cached", freshnessType: "END_OF_DAY", quality: "partial" })) },
      ]);
    });
  }

  earningsCalendar(from: string, to: string, symbol?: string) {
    const normalized = symbol ? normalizeSymbol(symbol) : undefined;
    const fixture = deterministicE2EProvider(); if (fixture) return fixture.earningsCalendar(from, to, normalized);
    const order = this.fundamentalOrder();
    return providerCached(`earnings:${from}:${to}:${normalized ?? "all"}`, { freshSeconds: 3_600, staleSeconds: 21_600 }, () => firstAvailable("earnings-calendar", normalized, order.map((adapter) => ({ name: adapter.name, configured: adapter.isConfigured(), supported: !normalized || adapter.supportsSymbol(normalized), task: () => adapter.getEarningsCalendar(from, to, normalized) }))));
  }

  dividendCalendar(from: string, to: string, symbol?: string) {
    const normalized = symbol ? normalizeSymbol(symbol) : undefined;
    const fixture = deterministicE2EProvider(); if (fixture) return fixture.dividendCalendar(from, to, normalized);
    const order = this.fundamentalOrder();
    return providerCached(`dividends:${from}:${to}:${normalized ?? "all"}`, { freshSeconds: 7_200, staleSeconds: 86_400 }, () => firstAvailable("dividends-calendar", normalized, order.map((adapter) => ({ name: adapter.name, configured: adapter.isConfigured(), supported: !normalized || adapter.supportsSymbol(normalized), task: () => adapter.getDividendCalendar(from, to, normalized) }))));
  }

  economicCalendar(from: string, to: string) {
    const fixture = deterministicE2EProvider(); if (fixture) return fixture.economicCalendar(from, to);
    const order = this.fundamentalOrder();
    return providerCached(`economic-calendar:${from}:${to}`, { freshSeconds: 600, staleSeconds: 3_600 }, () => firstAvailable("economic-calendar", undefined, order.map((adapter) => ({ name: adapter.name, configured: adapter.isConfigured(), supported: true, task: () => adapter.getEconomicCalendar(from, to) }))));
  }

  news(symbolInput: string, limit = 20) {
    const symbol = normalizeSymbol(symbolInput);
    const fixture = deterministicE2EProvider(); if (fixture) return fixture.news(symbol, limit);
    const order = this.newsOrder();
    return providerCached(`news:${symbol}:${limit}`, { freshSeconds: 600, staleSeconds: 3_600 }, () => firstAvailable("news", symbol, order.map((adapter) => ({ name: adapter.name, configured: adapter.isConfigured(), supported: true, task: () => adapter.getTickerNews(symbol, limit) }))));
  }

  topicNews(topics: string[], limit = 20) {
    const fixture = deterministicE2EProvider(); if (fixture) return fixture.topicNews(topics, limit);
    const order = this.newsOrder().filter((adapter) => adapter.name === "alpha-vantage" || adapter.name === "fmp");
    return providerCached(`topic-news:${topics.join(",")}:${limit}`, { freshSeconds: 900, staleSeconds: 3_600 }, () => firstAvailable("topic-news", undefined, order.map((adapter) => ({ name: adapter.name, configured: adapter.isConfigured(), supported: true, task: () => adapter.getTopicNews(topics, limit) }))));
  }

  senateTrades(symbolInput?: string, limit = 100) {
    const symbol = symbolInput ? normalizeSymbol(symbolInput) : undefined;
    const fixture = deterministicE2EProvider(); if (fixture) return fixture.political("SENATE", symbol, limit);
    const order = [politicalAdapters.fmp, politicalAdapters.bargo];
    return providerCached(`political:senate:${symbol ?? "latest"}:${limit}`, { freshSeconds: 3_600, staleSeconds: 21_600 }, () => firstAvailable("senate-trades", symbol, order.map((adapter) => ({ name: adapter.name, configured: adapter.isConfigured(), supported: true, task: () => adapter.getSenateTrades(symbol, limit) }))));
  }

  houseTrades(symbolInput?: string, limit = 100) {
    const symbol = symbolInput ? normalizeSymbol(symbolInput) : undefined;
    const fixture = deterministicE2EProvider(); if (fixture) return fixture.political("HOUSE", symbol, limit);
    const order = [politicalAdapters.fmp, politicalAdapters.bargo];
    return providerCached(`political:house:${symbol ?? "latest"}:${limit}`, { freshSeconds: 3_600, staleSeconds: 21_600 }, () => firstAvailable("house-trades", symbol, order.map((adapter) => ({ name: adapter.name, configured: adapter.isConfigured(), supported: true, task: () => adapter.getHouseTrades(symbol, limit) }))));
  }

  macroIndicator(indicator: "INFLATION" | "RATES" | "GDP" | "EMPLOYMENT") {
    const fixture = deterministicE2EProvider(); if (fixture) return fixture.macro(indicator);
    const order = [macroAdapters.fmp, macroAdapters["alpha-vantage"]];
    return providerCached(`macro:${indicator}`, { freshSeconds: 21_600, staleSeconds: 86_400 }, () => firstAvailable("macro-indicator", undefined, order.map((adapter) => ({ name: adapter.name, configured: adapter.isConfigured(), supported: true, task: () => adapter.getIndicator(indicator) }))));
  }

  capabilities(): ProviderCapability[] {
    return [
      { provider: "yahoo", configured: marketAdapters.yahoo.isConfigured(), capabilities: ["search", "quote", "historical-bars", "profile", "summary-fundamentals", "ticker-news", "global-symbols"], limitations: ["non-official API", "no historical statements in adapter", "quotes may be delayed"] },
      { provider: "fmp", configured: marketAdapters.fmp.isConfigured(), capabilities: ["profile", "statements", "ratios", "analyst-consensus", "earnings-calendar", "dividends-calendar", "economic-calendar", "house-disclosures", "senate-disclosures", "quote-fallback"], limitations: ["endpoint availability depends on subscription", "congressional disclosures may be delayed and amount-ranged", "daily fallback bars"] },
      { provider: "alpha-vantage", configured: newsAdapters["alpha-vantage"].isConfigured(), capabilities: ["ticker-news", "topic-news", "sentiment"], limitations: ["strict free-tier quotas", "coverage varies by symbol"] },
      { provider: "massive", configured: marketAdapters.massive.isConfigured(), capabilities: ["US snapshots", "US aggregate bars", "US market status", "US search"], limitations: ["US adapter only", "realtime depends on subscription", "5 calls/minute conservative limit"] },
      { provider: "bargo", configured: true, capabilities: ["recent congressional disclosures", "cross-source validation"], limitations: ["secondary source", "keyless history limited to about 3 months", "attribution required"] },
      { provider: "capitol-exposed", configured: true, capabilities: ["historical congressional disclosures", "paginated archive"], limitations: ["secondary source", "official verification remains separate", "attribution requested"] },
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
