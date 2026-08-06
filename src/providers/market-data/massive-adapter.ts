import "server-only";

import { getServerEnvironment } from "@/schemas/env";
import type { ChartInterval, ChartRange, MarketChartDto, MarketQuoteDto, SearchInstrument } from "@/types";
import { instrumentHref, normalizeSearchQuery, normalizeSymbol } from "@/services/yahoo/symbol-resolver";
import { ProviderError } from "../errors";
import { massiveGet, massiveNumber, massiveString, recordValue } from "../massive/client";
import { providerResult } from "../metadata";
import type { MarketDataProvider, MarketStatus } from "../types";

const DAY = 86_400_000;
const intervalMap: Record<ChartInterval, { multiplier: number; timespan: string }> = {
  "1m": { multiplier: 1, timespan: "minute" }, "2m": { multiplier: 2, timespan: "minute" }, "5m": { multiplier: 5, timespan: "minute" }, "15m": { multiplier: 15, timespan: "minute" }, "30m": { multiplier: 30, timespan: "minute" }, "60m": { multiplier: 1, timespan: "hour" }, "90m": { multiplier: 90, timespan: "minute" }, "1h": { multiplier: 1, timespan: "hour" }, "1d": { multiplier: 1, timespan: "day" }, "5d": { multiplier: 5, timespan: "day" }, "1wk": { multiplier: 1, timespan: "week" }, "1mo": { multiplier: 1, timespan: "month" }, "3mo": { multiplier: 3, timespan: "month" },
};
const defaultIntervals: Record<ChartRange, ChartInterval> = { "1D": "5m", "5D": "15m", "1M": "1h", "6M": "1d", YTD: "1d", "1Y": "1d", "5Y": "1wk", MAX: "1mo" };

function fromDate(range: ChartRange) {
  const now = new Date();
  const days: Record<ChartRange, number> = { "1D": 2, "5D": 7, "1M": 32, "6M": 185, YTD: 370, "1Y": 367, "5Y": 1_830, MAX: 18_250 };
  const start = range === "YTD" ? new Date(Date.UTC(now.getUTCFullYear(), 0, 1)) : new Date(now.getTime() - days[range] * DAY);
  return start.toISOString().slice(0, 10);
}

function nanosToIso(value: number | null): string | null {
  if (value === null) return null;
  const milliseconds = value > 10_000_000_000_000 ? Math.floor(value / 1_000_000) : value;
  const date = new Date(milliseconds);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

export class MassiveMarketDataAdapter implements MarketDataProvider {
  readonly name = "massive" as const;
  isConfigured() { return Boolean(getServerEnvironment().MASSIVE_API_KEY); }
  supportsSymbol(symbolInput: string) {
    try {
      const symbol = normalizeSymbol(symbolInput);
      return !symbol.startsWith("^") && !symbol.includes("=") && !symbol.endsWith("-USD") && !/\.[A-Z]{2,4}$/.test(symbol);
    } catch { return false; }
  }

  async searchInstruments(queryInput: string) {
    const query = normalizeSearchQuery(queryInput);
    const response = await massiveGet("/v3/reference/tickers", { search: query, market: "stocks", active: true, limit: 12, order: "asc", sort: "ticker" }, "search");
    const results = Array.isArray(response.results) ? response.results : [];
    const data = results.flatMap((value): SearchInstrument[] => {
      if (!value || typeof value !== "object") return [];
      const row = value as Record<string, unknown>;
      const symbol = massiveString(row, "ticker");
      if (!symbol) return [];
      const venue = massiveString(row, "primary_exchange", "market") ?? "US";
      return [{ symbol, name: massiveString(row, "name") ?? symbol, type: massiveString(row, "type") === "ETF" ? "ETF" : "Stock", venue, price: 0, currency: massiveString(row, "currency_name") ?? "USD", href: instrumentHref(symbol, venue, "EQUITY"), source: "massive" }];
    });
    return providerResult(this.name, data, { freshness: "cached", quality: data.length ? "verified" : "partial" });
  }

  async getQuote(symbolInput: string) {
    const symbol = normalizeSymbol(symbolInput);
    if (!this.supportsSymbol(symbol)) throw new ProviderError(this.name, "UNSUPPORTED_SYMBOL", "Massive adapter limitato ai ticker USA.", false, 422);
    const response = await massiveGet(`/v2/snapshot/locale/us/markets/stocks/tickers/${encodeURIComponent(symbol)}`, {}, "quote");
    const ticker = recordValue(response, "ticker");
    const day = recordValue(ticker, "day");
    const previous = recordValue(ticker, "prevDay");
    const trade = recordValue(ticker, "lastTrade");
    const price = massiveNumber(trade, "p") ?? massiveNumber(day, "c");
    if (price === null) throw new ProviderError(this.name, "NOT_FOUND", "Snapshot Massive non disponibile.", false, 404);
    const previousClose = massiveNumber(previous, "c");
    const change = massiveNumber(ticker, "todaysChange") ?? (previousClose === null ? 0 : price - previousClose);
    const changePercent = massiveNumber(ticker, "todaysChangePerc") ?? (previousClose ? change / previousClose * 100 : 0);
    const asOf = nanosToIso(massiveNumber(trade, "t") ?? massiveNumber(ticker, "updated"));
    const realtime = getServerEnvironment().ENABLE_REALTIME_DATA;
    const data: MarketQuoteDto = { symbol, name: symbol, exchange: "US", quoteType: "EQUITY", currency: "USD", price, change, changePercent, open: massiveNumber(day, "o"), previousClose, dayLow: massiveNumber(day, "l"), dayHigh: massiveNumber(day, "h"), volume: massiveNumber(day, "v"), marketCap: null, marketState: "REGULAR", asOf, isDelayed: !realtime, source: "massive" };
    return providerResult(this.name, data, { sourceTimestamp: asOf, freshness: realtime ? "realtime" : "delayed", quality: "partial" });
  }

  async getQuotes(symbols: string[]) {
    const results = await Promise.allSettled(symbols.slice(0, 20).map((symbol) => this.getQuote(symbol)));
    const data = results.flatMap((result) => result.status === "fulfilled" ? [result.value.data] : []);
    if (!data.length) throw new ProviderError(this.name, "NOT_FOUND", "Nessuno snapshot Massive disponibile.", false, 404);
    return providerResult(this.name, data, { freshness: getServerEnvironment().ENABLE_REALTIME_DATA ? "realtime" : "delayed", quality: data.length === symbols.length ? "verified" : "partial" });
  }

  async getHistoricalBars(symbolInput: string, range: ChartRange, intervalInput?: string | null) {
    const symbol = normalizeSymbol(symbolInput);
    if (!this.supportsSymbol(symbol)) throw new ProviderError(this.name, "UNSUPPORTED_SYMBOL", "Massive adapter limitato ai ticker USA.", false, 422);
    const interval = (intervalInput ?? defaultIntervals[range]) as ChartInterval;
    const mapped = intervalMap[interval];
    if (!mapped) throw new ProviderError(this.name, "NOT_FOUND", "Intervallo Massive non supportato.", false, 400);
    const response = await massiveGet(`/v2/aggs/ticker/${encodeURIComponent(symbol)}/range/${mapped.multiplier}/${mapped.timespan}/${fromDate(range)}/${new Date().toISOString().slice(0, 10)}`, { adjusted: true, sort: "asc", limit: 50_000 }, "historical-bars");
    const results = Array.isArray(response.results) ? response.results : [];
    const points = results.flatMap((value) => {
      if (!value || typeof value !== "object") return [];
      const row = value as Record<string, unknown>;
      const timestamp = nanosToIso(massiveNumber(row, "t")); const open = massiveNumber(row, "o"); const high = massiveNumber(row, "h"); const low = massiveNumber(row, "l"); const close = massiveNumber(row, "c"); const volume = massiveNumber(row, "v");
      if (!timestamp || open === null || high === null || low === null || close === null || volume === null) return [];
      return [{ timestamp, open, high, low, close, volume }];
    });
    if (!points.length) throw new ProviderError(this.name, "NOT_FOUND", "Storico Massive non disponibile.", false, 404);
    const realtime = getServerEnvironment().ENABLE_REALTIME_DATA;
    const data: MarketChartDto = { symbol, currency: "USD", exchange: "US", range, interval, previousClose: points.at(-2)?.close ?? null, isDelayed: !realtime, asOf: points.at(-1)?.timestamp ?? null, points, source: "massive" };
    return providerResult(this.name, data, { sourceTimestamp: data.asOf, freshness: realtime ? "realtime" : "delayed" });
  }

  async getMarketStatus() {
    const response = await massiveGet("/v1/marketstatus/now", {}, "market-status");
    const market = massiveString(response, "market") ?? "unknown";
    const data: MarketStatus = { market: "US", state: market === "open" ? "open" : market === "extended-hours" ? "extended" : market === "closed" ? "closed" : "unknown", asOf: massiveString(response, "serverTime") ?? new Date().toISOString(), nextOpen: null, nextClose: null };
    return providerResult(this.name, data, { sourceTimestamp: data.asOf, freshness: "realtime" });
  }
}
