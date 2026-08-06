import "server-only";

import YahooFinance from "yahoo-finance2";
import type {
  ChartInterval,
  ChartRange,
  MarketChartDto,
  MarketFundamentalsDto,
  MarketNewsDto,
  MarketProfileDto,
  MarketQuoteDto,
  SearchInstrument,
} from "@/types";
import { cached } from "./cache";
import { FinancialDataError, safeServerLog, toFinancialDataError } from "./errors";
import { instrumentHref, normalizeSearchQuery, normalizeSymbol } from "./symbol-resolver";

const quietLogger = { info() {}, warn() {}, error() {}, debug() {}, dir() {} };
const yahoo = new YahooFinance({
  queue: { concurrency: 3, interval: 100 },
  suppressNotices: ["yahooSurvey"],
  versionCheck: false,
  logger: quietLogger,
});

const DAY = 86_400_000;
const chartDefaults: Record<ChartRange, { days?: number; startOfYear?: boolean; max?: boolean; interval: ChartInterval }> = {
  "1D": { days: 1, interval: "5m" },
  "5D": { days: 5, interval: "15m" },
  "1M": { days: 31, interval: "1h" },
  "6M": { days: 183, interval: "1d" },
  YTD: { startOfYear: true, interval: "1d" },
  "1Y": { days: 366, interval: "1d" },
  "5Y": { days: 365 * 5 + 2, interval: "1wk" },
  MAX: { max: true, interval: "1mo" },
};

const intervalCompatibility: Record<ChartRange, ChartInterval[]> = {
  "1D": ["1m", "2m", "5m", "15m", "30m", "60m", "90m", "1h"],
  "5D": ["5m", "15m", "30m", "60m", "90m", "1h"],
  "1M": ["30m", "60m", "1h", "1d"],
  "6M": ["1d", "5d", "1wk"],
  YTD: ["1d", "5d", "1wk"],
  "1Y": ["1d", "5d", "1wk"],
  "5Y": ["1d", "5d", "1wk", "1mo"],
  MAX: ["1wk", "1mo", "3mo"],
};

function moduleOptions(timeoutMs: number) {
  return { fetchOptions: { signal: AbortSignal.timeout(timeoutMs) } };
}

function retryable(error: unknown) {
  const normalized = toFinancialDataError(error);
  return normalized.code === "TIMEOUT" || normalized.code === "RATE_LIMITED" || normalized.code === "UPSTREAM";
}

async function withRetry<T>(operation: string, symbol: string | undefined, task: () => Promise<T>, retries = 1): Promise<T> {
  let lastError: unknown;
  for (let attempt = 0; attempt <= retries; attempt += 1) {
    try {
      return await task();
    } catch (error) {
      lastError = error;
      if (attempt >= retries || !retryable(error)) break;
      await new Promise((resolve) => setTimeout(resolve, 180 + Math.round(Math.random() * 220)));
    }
  }
  safeServerLog(operation, symbol, lastError);
  throw toFinancialDataError(lastError);
}

function finite(value: unknown, fallback = 0): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function nullable(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function displayType(quoteType: string | undefined): SearchInstrument["type"] | null {
  switch (quoteType) {
    case "EQUITY": return "Stock";
    case "ETF": case "MUTUALFUND": return "ETF";
    case "INDEX": return "Index";
    case "CURRENCY": return "Forex";
    case "CRYPTOCURRENCY": return "Crypto";
    default: return null;
  }
}

function mapQuote(quote: Awaited<ReturnType<typeof yahoo.quote>>): MarketQuoteDto {
  const price = nullable(quote.regularMarketPrice);
  if (!quote.symbol || price === null) throw new FinancialDataError("NOT_FOUND", "Quotazione non disponibile per questo simbolo.", 404);
  return {
    symbol: quote.symbol,
    name: quote.longName || quote.shortName || quote.symbol,
    exchange: quote.fullExchangeName || quote.exchange || "—",
    quoteType: quote.quoteType,
    currency: quote.currency || "USD",
    price,
    change: finite(quote.regularMarketChange),
    changePercent: finite(quote.regularMarketChangePercent),
    open: nullable(quote.regularMarketOpen),
    previousClose: nullable(quote.regularMarketPreviousClose),
    dayLow: nullable(quote.regularMarketDayLow),
    dayHigh: nullable(quote.regularMarketDayHigh),
    volume: nullable(quote.regularMarketVolume),
    marketCap: nullable(quote.marketCap),
    marketState: quote.marketState || "CLOSED",
    asOf: quote.regularMarketTime instanceof Date ? quote.regularMarketTime.toISOString() : null,
    isDelayed: finite(quote.exchangeDataDelayedBy) > 0 || /delayed/i.test(quote.quoteSourceName || ""),
    source: "yahoo",
  };
}

export function resolveChartInterval(range: ChartRange, requested?: string | null): ChartInterval {
  const fallback = chartDefaults[range].interval;
  if (!requested) return fallback;
  if (!intervalCompatibility[range].includes(requested as ChartInterval)) {
    throw new FinancialDataError("INVALID_QUERY", `Intervallo ${requested} non compatibile con il periodo ${range}.`, 400);
  }
  return requested as ChartInterval;
}

function periodStart(range: ChartRange): Date {
  const now = new Date();
  const config = chartDefaults[range];
  if (config.max) return new Date("1970-01-01T00:00:00.000Z");
  if (config.startOfYear) return new Date(Date.UTC(now.getUTCFullYear(), 0, 1));
  return new Date(now.getTime() - (config.days ?? 365) * DAY);
}

export class YahooFinanceClient {
  async quote(symbolInput: string): Promise<MarketQuoteDto> {
    const symbol = normalizeSymbol(symbolInput);
    return (await cached(`quote:${symbol}`, { freshMs: 20_000, staleMs: 120_000 }, () =>
      withRetry("quote", symbol, async () => mapQuote(await yahoo.quote(symbol, {}, moduleOptions(12_000))))
    )).value;
  }

  async quotes(symbolInputs: string[]): Promise<MarketQuoteDto[]> {
    const symbols = [...new Set(symbolInputs.map(normalizeSymbol))].slice(0, 50);
    if (!symbols.length) return [];
    return (await cached(`quotes:${symbols.join(",")}`, { freshMs: 20_000, staleMs: 120_000 }, () =>
      withRetry("quotes", undefined, async () => {
        const result = await yahoo.quote(symbols, { return: "array" }, moduleOptions(15_000));
        return result.flatMap((quote) => {
          try { return [mapQuote(quote)]; } catch { return []; }
        });
      })
    )).value;
  }

  async search(queryInput: string): Promise<SearchInstrument[]> {
    const query = normalizeSearchQuery(queryInput);
    return (await cached(`search:${query.toLocaleLowerCase("en")}`, { freshMs: 5 * 60_000, staleMs: 30 * 60_000 }, () =>
      withRetry("search", undefined, async () => {
        const result = await yahoo.search(query, { quotesCount: 12, newsCount: 0, enableFuzzyQuery: true }, moduleOptions(12_000));
        const candidates = result.quotes.flatMap((item) => {
          if (!item.isYahooFinance) return [];
          const type = displayType(item.quoteType);
          if (!type) return [];
          return [{ item, type }];
        });
        const live = await this.quotes(candidates.map(({ item }) => item.symbol));
        const prices = new Map(live.map((item) => [item.symbol, item]));
        return candidates.map(({ item, type }) => {
          const quote = prices.get(item.symbol);
          return {
            symbol: item.symbol,
            name: item.longname || item.shortname || item.symbol,
            type,
            venue: item.exchDisp || item.exchange,
            price: quote?.price ?? 0,
            currency: quote?.currency,
            href: instrumentHref(item.symbol, item.exchange, item.quoteType),
            source: "yahoo" as const,
          };
        });
      })
    )).value;
  }

  async chart(symbolInput: string, range: ChartRange, requestedInterval?: string | null): Promise<MarketChartDto> {
    const symbol = normalizeSymbol(symbolInput);
    const interval = resolveChartInterval(range, requestedInterval);
    const policy = range === "1D" || range === "5D" ? { freshMs: 60_000, staleMs: 5 * 60_000 } : { freshMs: 15 * 60_000, staleMs: 6 * 60 * 60_000 };
    return (await cached(`chart:${symbol}:${range}:${interval}`, policy, () => withRetry("chart", symbol, async () => {
      const result = await yahoo.chart(symbol, { period1: periodStart(range), interval, events: "div|split", return: "array" }, moduleOptions(18_000));
      const points = result.quotes.flatMap((point) => {
        if (!(point.date instanceof Date) || [point.open, point.high, point.low, point.close, point.volume].some((value) => typeof value !== "number" || !Number.isFinite(value))) return [];
        return [{
          timestamp: point.date.toISOString(),
          open: point.open as number,
          high: point.high as number,
          low: point.low as number,
          close: point.close as number,
          adjustedClose: nullable(point.adjclose) ?? undefined,
          volume: point.volume as number,
        }];
      });
      if (!points.length) throw new FinancialDataError("NOT_FOUND", "Storico prezzi non disponibile per questo periodo.", 404);
      const delayedMinutes = result.meta.regularMarketTime ? Math.max(0, (Date.now() - result.meta.regularMarketTime.getTime()) / 60_000) : 0;
      return {
        symbol,
        currency: result.meta.currency || "USD",
        exchange: result.meta.fullExchangeName || result.meta.exchangeName || "—",
        range,
        interval,
        previousClose: nullable(result.meta.previousClose ?? result.meta.chartPreviousClose),
        isDelayed: delayedMinutes > 20,
        asOf: result.meta.regularMarketTime?.toISOString() ?? points.at(-1)?.timestamp ?? null,
        points,
        source: "yahoo" as const,
      };
    }, 1))).value;
  }

  async profile(symbolInput: string): Promise<MarketProfileDto> {
    const symbol = normalizeSymbol(symbolInput);
    return (await cached(`profile:${symbol}`, { freshMs: 24 * 60 * 60_000, staleMs: 7 * 24 * 60 * 60_000 }, () => withRetry("profile", symbol, async () => {
      const quote = await this.quote(symbol);
      const summary = await yahoo.quoteSummary(symbol, { modules: ["assetProfile", "quoteType"] }, moduleOptions(15_000)).catch(() => null);
      const profile = summary?.assetProfile;
      return {
        symbol,
        name: quote.name,
        exchange: quote.exchange,
        quoteType: quote.quoteType,
        currency: quote.currency,
        country: profile?.country ?? null,
        sector: profile?.sectorDisp || profile?.sector || null,
        industry: profile?.industryDisp || profile?.industry || null,
        description: profile?.longBusinessSummary ?? profile?.description ?? null,
        employees: nullable(profile?.fullTimeEmployees),
        website: profile?.website ?? null,
        source: "yahoo" as const,
      };
    }))).value;
  }

  async fundamentals(symbolInput: string): Promise<MarketFundamentalsDto> {
    const symbol = normalizeSymbol(symbolInput);
    return (await cached(`fundamentals:${symbol}`, { freshMs: 6 * 60 * 60_000, staleMs: 48 * 60 * 60_000 }, () => withRetry("fundamentals", symbol, async () => {
      await this.quote(symbol);
      const summary = await yahoo.quoteSummary(symbol, { modules: ["summaryDetail", "defaultKeyStatistics", "financialData"] }, moduleOptions(18_000)).catch(() => null);
      const detail = summary?.summaryDetail;
      const stats = summary?.defaultKeyStatistics;
      const financial = summary?.financialData;
      return {
        symbol,
        marketCap: nullable(detail?.marketCap),
        enterpriseValue: nullable(stats?.enterpriseValue),
        trailingEps: nullable(stats?.trailingEps),
        trailingPe: nullable(detail?.trailingPE),
        forwardPe: nullable(stats?.forwardPE),
        priceToBook: nullable(stats?.priceToBook),
        dividendRate: nullable(detail?.dividendRate),
        dividendYield: nullable(detail?.dividendYield),
        returnOnEquity: nullable(financial?.returnOnEquity),
        debtToEquity: nullable(financial?.debtToEquity),
        profitMargins: nullable(financial?.profitMargins),
        revenue: nullable(financial?.totalRevenue),
        freeCashflow: nullable(financial?.freeCashflow),
        sharesOutstanding: nullable(stats?.sharesOutstanding),
        source: "yahoo" as const,
      };
    }))).value;
  }

  async news(symbolInput: string): Promise<MarketNewsDto[]> {
    const symbol = normalizeSymbol(symbolInput);
    return (await cached(`news:${symbol}`, { freshMs: 10 * 60_000, staleMs: 60 * 60_000 }, () => withRetry("news", symbol, async () => {
      const result = await yahoo.search(symbol, { quotesCount: 0, newsCount: 12 }, moduleOptions(12_000));
      return result.news.filter((item) => item.title && item.link.startsWith("https://")).map((item) => ({
        id: item.uuid,
        title: item.title,
        publisher: item.publisher,
        publishedAt: item.providerPublishTime.toISOString(),
        url: item.link,
        relatedSymbols: item.relatedTickers ?? [],
      }));
    }))).value;
  }
}

export const yahooFinanceClient = new YahooFinanceClient();
