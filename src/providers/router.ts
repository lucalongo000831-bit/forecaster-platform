import "server-only";

import { structuredLog } from "@/lib/server/logger";
import { getServerEnvironment } from "@/schemas/env";
import { normalizeSearchQuery, normalizeSymbol } from "@/services/yahoo/symbol-resolver";
import { providerCached } from "./cache";
import { ProviderError } from "./errors";
import { FmpFundamentalsAdapter } from "./fundamentals/fmp-adapter";
import { YahooFundamentalsAdapter } from "./fundamentals/yahoo-adapter";
import { AlphaVantageNewsAdapter } from "./news/alpha-vantage-adapter";
import { YahooNewsAdapter } from "./news/yahoo-adapter";
import { FmpMarketDataAdapter } from "./market-data/fmp-adapter";
import { MassiveMarketDataAdapter } from "./market-data/massive-adapter";
import { YahooMarketDataAdapter } from "./market-data/yahoo-adapter";
import type {
  FundamentalsProvider,
  MarketDataProvider,
  NewsProvider,
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
} satisfies Record<"massive" | "yahoo" | "fmp", MarketDataProvider>;
const fundamentalAdapters = { fmp: new FmpFundamentalsAdapter(), yahoo: new YahooFundamentalsAdapter() } satisfies Record<"fmp" | "yahoo", FundamentalsProvider>;
const newsAdapters = { "alpha-vantage": new AlphaVantageNewsAdapter(), yahoo: new YahooNewsAdapter() } satisfies Record<"alpha-vantage" | "yahoo", NewsProvider>;

function unique<T>(values: T[]) { return [...new Set(values)]; }

async function firstAvailable<T>(operation: string, symbol: string | undefined, candidates: Array<{ name: ProviderName; configured: boolean; supported: boolean; task: () => Promise<ProviderResult<T>> }>) {
  const errors: ProviderError[] = [];
  let attempted = 0;
  for (const candidate of candidates) {
    if (!candidate.configured || !candidate.supported) continue;
    attempted += 1;
    try {
      const result = await candidate.task();
      return { ...result, meta: { ...result.meta, isFallback: attempted > 1 } };
    } catch (error) {
      const normalized = error instanceof ProviderError ? error : new ProviderError(candidate.name, "UPSTREAM_UNAVAILABLE", "Provider non disponibile.", true, 502, { cause: error });
      errors.push(normalized);
      structuredLog("warn", "provider.router.fallback", { provider: candidate.name, operation, symbol, code: normalized.code });
    }
  }
  const terminal = errors.find((error) => error.code === "NOT_FOUND") ?? errors.at(-1);
  throw terminal ?? new ProviderError("yahoo", "NOT_CONFIGURED", "Nessun provider configurato per questa operazione.", false, 503);
}

export class FinancialProviderRouter {
  private marketOrder(): MarketDataProvider[] {
    const env = getServerEnvironment();
    return unique([env.MARKET_DATA_PRIMARY_PROVIDER, env.MARKET_DATA_FALLBACK_PROVIDER, "yahoo", "fmp"] as const).map((name) => marketAdapters[name]);
  }
  private fundamentalOrder(): FundamentalsProvider[] {
    const env = getServerEnvironment();
    return unique([env.FUNDAMENTALS_PRIMARY_PROVIDER, "fmp", "yahoo"] as const).map((name) => fundamentalAdapters[name]);
  }
  private newsOrder(): NewsProvider[] {
    const env = getServerEnvironment();
    return unique([env.NEWS_PRIMARY_PROVIDER, "alpha-vantage", "yahoo"] as const).map((name) => newsAdapters[name]);
  }

  search(queryInput: string) {
    const query = normalizeSearchQuery(queryInput);
    const order = [marketAdapters.yahoo, ...this.marketOrder().filter((adapter) => adapter.name !== "yahoo")];
    return providerCached(`search:${query.toLowerCase()}`, { freshSeconds: 300, staleSeconds: 1_800 }, () => firstAvailable("search", undefined, order.map((adapter) => ({ name: adapter.name, configured: adapter.isConfigured(), supported: true, task: () => adapter.searchInstruments(query) }))));
  }

  quote(symbolInput: string) {
    const symbol = normalizeSymbol(symbolInput);
    const order = this.marketOrder();
    return providerCached(`quote:${symbol}`, { freshSeconds: 20, staleSeconds: 120 }, () => firstAvailable("quote", symbol, order.map((adapter) => ({ name: adapter.name, configured: adapter.isConfigured(), supported: adapter.supportsSymbol(symbol), task: () => adapter.getQuote(symbol) }))));
  }

  quotes(symbolInputs: string[]) {
    const symbols = unique(symbolInputs.map(normalizeSymbol)).slice(0, 50);
    const order = this.marketOrder();
    return providerCached(`quotes:${symbols.join(",")}`, { freshSeconds: 20, staleSeconds: 120 }, () => firstAvailable("quotes", undefined, order.map((adapter) => ({ name: adapter.name, configured: adapter.isConfigured(), supported: symbols.every((symbol) => adapter.supportsSymbol(symbol)), task: () => adapter.getQuotes(symbols) }))));
  }

  chart(symbolInput: string, range: ChartRange, interval?: string | null) {
    const symbol = normalizeSymbol(symbolInput);
    const order = this.marketOrder();
    const intraday = range === "1D" || range === "5D";
    return providerCached(`chart:${symbol}:${range}:${interval ?? "auto"}`, { freshSeconds: intraday ? 60 : 900, staleSeconds: intraday ? 300 : 21_600 }, () => firstAvailable("chart", symbol, order.map((adapter) => ({ name: adapter.name, configured: adapter.isConfigured(), supported: adapter.supportsSymbol(symbol), task: () => adapter.getHistoricalBars(symbol, range, interval) }))));
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

  earningsCalendar(from: string, to: string, symbol?: string) {
    const normalized = symbol ? normalizeSymbol(symbol) : undefined;
    const order = this.fundamentalOrder();
    return providerCached(`earnings:${from}:${to}:${normalized ?? "all"}`, { freshSeconds: 3_600, staleSeconds: 21_600 }, () => firstAvailable("earnings-calendar", normalized, order.map((adapter) => ({ name: adapter.name, configured: adapter.isConfigured(), supported: !normalized || adapter.supportsSymbol(normalized), task: () => adapter.getEarningsCalendar(from, to, normalized) }))));
  }

  news(symbolInput: string, limit = 20) {
    const symbol = normalizeSymbol(symbolInput);
    const order = this.newsOrder();
    return providerCached(`news:${symbol}:${limit}`, { freshSeconds: 600, staleSeconds: 3_600 }, () => firstAvailable("news", symbol, order.map((adapter) => ({ name: adapter.name, configured: adapter.isConfigured(), supported: true, task: () => adapter.getTickerNews(symbol, limit) }))));
  }

  topicNews(topics: string[], limit = 20) {
    const order = this.newsOrder().filter((adapter) => adapter.name === "alpha-vantage");
    return providerCached(`topic-news:${topics.join(",")}:${limit}`, { freshSeconds: 900, staleSeconds: 3_600 }, () => firstAvailable("topic-news", undefined, order.map((adapter) => ({ name: adapter.name, configured: adapter.isConfigured(), supported: true, task: () => adapter.getTopicNews(topics, limit) }))));
  }

  capabilities(): ProviderCapability[] {
    return [
      { provider: "yahoo", configured: marketAdapters.yahoo.isConfigured(), capabilities: ["search", "quote", "historical-bars", "profile", "summary-fundamentals", "ticker-news", "global-symbols"], limitations: ["non-official API", "no historical statements in adapter", "quotes may be delayed"] },
      { provider: "fmp", configured: marketAdapters.fmp.isConfigured(), capabilities: ["profile", "statements", "ratios", "analyst-consensus", "earnings-calendar", "quote-fallback"], limitations: ["endpoint availability depends on subscription", "daily fallback bars"] },
      { provider: "alpha-vantage", configured: newsAdapters["alpha-vantage"].isConfigured(), capabilities: ["ticker-news", "topic-news", "sentiment"], limitations: ["strict free-tier quotas", "coverage varies by symbol"] },
      { provider: "massive", configured: marketAdapters.massive.isConfigured(), capabilities: ["US snapshots", "US aggregate bars", "US market status", "US search"], limitations: ["US adapter only", "realtime depends on subscription", "5 calls/minute conservative limit"] },
    ];
  }
}

export const financialProviderRouter = new FinancialProviderRouter();
