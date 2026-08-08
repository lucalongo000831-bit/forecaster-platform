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
const defaultIntervals: Record<ChartRange, ChartInterval> = { "1D": "5m", "5D": "15m", "1M": "1h", "3M": "1d", "6M": "1d", YTD: "1d", "1Y": "1d", "5Y": "1wk", "10Y": "1wk", MAX: "1mo" };

function fromDate(range: ChartRange) {
  const now = new Date();
  const days: Record<ChartRange, number> = { "1D": 2, "5D": 7, "1M": 32, "3M": 95, "6M": 185, YTD: 370, "1Y": 367, "5Y": 1_830, "10Y": 3_660, MAX: 18_250 };
  const start = range === "YTD" ? new Date(Date.UTC(now.getUTCFullYear(), 0, 1)) : new Date(now.getTime() - days[range] * DAY);
  return start.toISOString().slice(0, 10);
}

function timestampToIso(value: number | null): string | null {
  if (value === null) return null;
  const milliseconds = value > 10_000_000_000_000 ? Math.floor(value / 1_000_000) : value < 10_000_000_000 ? value * 1_000 : value;
  const date = new Date(milliseconds);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function isCrypto(symbol: string) { return symbol.endsWith("-USD"); }
function massiveSymbol(symbol: string) { return isCrypto(symbol) ? `X:${symbol.replace("-", "")}` : symbol; }

function mapUnifiedSnapshot(row: Record<string, unknown>, requestedSymbol: string): MarketQuoteDto {
  const session = recordValue(row, "session");
  const trade = Object.keys(recordValue(row, "last_trade")).length ? recordValue(row, "last_trade") : recordValue(row, "lastTrade");
  const quote = Object.keys(recordValue(row, "last_quote")).length ? recordValue(row, "last_quote") : recordValue(row, "lastQuote");
  const price = massiveNumber(trade, "price", "p") ?? massiveNumber(session, "close", "c");
  if (price === null) throw new ProviderError("massive", "NOT_FOUND", "Snapshot Massive non disponibile.", false, 404);
  const previousClose = massiveNumber(session, "previous_close", "previousClose");
  const change = massiveNumber(session, "change") ?? (previousClose === null ? 0 : price - previousClose);
  const changePercent = massiveNumber(session, "change_percent", "changePercent") ?? (previousClose ? change / previousClose * 100 : 0);
  const asOf = timestampToIso(massiveNumber(trade, "timestamp", "participant_timestamp", "sip_timestamp", "t")) ?? timestampToIso(massiveNumber(row, "last_updated", "updated"));
  const crypto = isCrypto(requestedSymbol);
  const status = massiveString(row, "market_status") ?? (crypto ? "open" : "unknown");
  return {
    symbol: requestedSymbol,
    name: requestedSymbol,
    exchange: crypto ? "CRYPTO" : "US",
    quoteType: crypto ? "CRYPTOCURRENCY" : "EQUITY",
    currency: "USD",
    price,
    change,
    changePercent,
    open: massiveNumber(session, "open", "o"),
    previousClose,
    dayLow: massiveNumber(session, "low", "l"),
    dayHigh: massiveNumber(session, "high", "h"),
    volume: massiveNumber(session, "volume", "v"),
    marketCap: null,
    bid: massiveNumber(quote, "bid_price", "bid", "bp"),
    ask: massiveNumber(quote, "ask_price", "ask", "ap"),
    marketState: status === "open" ? "REGULAR" : status === "early_trading" || status === "late_trading" ? "EXTENDED" : status === "closed" ? "CLOSED" : crypto ? "REGULAR" : "UNKNOWN",
    asOf,
    isDelayed: false,
    source: "massive",
  };
}

async function aggregateQuote(symbol: string): Promise<{ data: MarketQuoteDto; delayed: boolean }> {
  const response = await massiveGet(`/v2/aggs/ticker/${encodeURIComponent(massiveSymbol(symbol))}/range/1/minute/${fromDate("5D")}/${new Date().toISOString().slice(0, 10)}`, { adjusted: true, sort: "asc", limit: 50_000 }, "quote-aggregates");
  const rows = (Array.isArray(response.results) ? response.results : []).flatMap((value) => value && typeof value === "object" ? [value as Record<string, unknown>] : []);
  const latest = rows.at(-1); const price = latest ? massiveNumber(latest, "c") : null; const asOf = latest ? timestampToIso(massiveNumber(latest, "t")) : null;
  if (!latest || price === null || !asOf) throw new ProviderError("massive", "NOT_FOUND", "Aggregati Massive non disponibili.", false, 404);
  const sessionDate = asOf.slice(0, 10); const sessionRows = rows.filter((row) => timestampToIso(massiveNumber(row, "t"))?.slice(0, 10) === sessionDate);
  const previous = [...rows].reverse().find((row) => timestampToIso(massiveNumber(row, "t"))?.slice(0, 10) !== sessionDate);
  const previousClose = previous ? massiveNumber(previous, "c") : null;
  const open = sessionRows.length ? massiveNumber(sessionRows[0]!, "o") : null;
  const dayHigh = sessionRows.reduce<number | null>((maximum, row) => { const value = massiveNumber(row, "h"); return value === null ? maximum : maximum === null ? value : Math.max(maximum, value); }, null);
  const dayLow = sessionRows.reduce<number | null>((minimum, row) => { const value = massiveNumber(row, "l"); return value === null ? minimum : minimum === null ? value : Math.min(minimum, value); }, null);
  const volume = sessionRows.reduce((sum, row) => sum + (massiveNumber(row, "v") ?? 0), 0);
  const change = previousClose === null ? 0 : price - previousClose; const changePercent = previousClose ? change / previousClose * 100 : 0;
  const delayed = massiveString(response, "status") === "DELAYED" || Date.now() - new Date(asOf).getTime() > 120_000;
  return { delayed, data: { symbol, name: symbol, exchange: isCrypto(symbol) ? "CRYPTO" : "US", quoteType: isCrypto(symbol) ? "CRYPTOCURRENCY" : "EQUITY", currency: "USD", price, change, changePercent, open, previousClose, dayLow, dayHigh, volume, marketCap: null, bid: null, ask: null, marketState: isCrypto(symbol) ? "REGULAR" : "REGULAR", asOf, isDelayed: delayed, source: "massive" } };
}

export class MassiveMarketDataAdapter implements MarketDataProvider {
  readonly name = "massive" as const;
  isConfigured() { const env = getServerEnvironment(); return Boolean(env.MASSIVE_API_KEY ?? env.POLYGON_API_KEY); }
  supportsSymbol(symbolInput: string) {
    try {
      const symbol = normalizeSymbol(symbolInput);
      return isCrypto(symbol) || (!symbol.startsWith("^") && !symbol.includes("=") && !/\.[A-Z]{2,4}$/.test(symbol));
    } catch { return false; }
  }

  async searchInstruments(queryInput: string) {
    const query = normalizeSearchQuery(queryInput);
    const response = await massiveGet("/v3/reference/tickers", { search: query, active: true, limit: 12, order: "asc", sort: "ticker" }, "search");
    const results = Array.isArray(response.results) ? response.results : [];
    const data = results.flatMap((value): SearchInstrument[] => {
      if (!value || typeof value !== "object") return [];
      const row = value as Record<string, unknown>;
      const rawSymbol = massiveString(row, "ticker");
      if (!rawSymbol) return [];
      const crypto = rawSymbol.startsWith("X:");
      const symbol = crypto ? rawSymbol.slice(2).replace(/USD$/, "-USD") : rawSymbol;
      const venue = massiveString(row, "primary_exchange", "market") ?? (crypto ? "CRYPTO" : "US");
      const rawType = massiveString(row, "type")?.toLowerCase() ?? "";
      const type: SearchInstrument["type"] = crypto ? "Crypto" : rawType.includes("etf") ? "ETF" : "Stock";
      return [{ symbol, name: massiveString(row, "name") ?? symbol, type, venue, price: 0, currency: massiveString(row, "currency_name") ?? "USD", href: instrumentHref(symbol, venue, crypto ? "CRYPTOCURRENCY" : type === "ETF" ? "ETF" : "EQUITY"), source: "massive" }];
    });
    return providerResult(this.name, data, { freshness: "cached", freshnessType: "CACHED", quality: data.length ? "verified" : "partial" });
  }

  async getQuote(symbolInput: string) {
    const symbol = normalizeSymbol(symbolInput);
    if (!this.supportsSymbol(symbol)) throw new ProviderError(this.name, "UNSUPPORTED_SYMBOL", "Simbolo non supportato dall'adapter Massive.", false, 422);
    try {
      const response = await massiveGet("/v3/snapshot", { ticker: massiveSymbol(symbol), market_type: isCrypto(symbol) ? "crypto" : "stocks", limit: 1 }, "quote");
      const values = Array.isArray(response.results) ? response.results : response.results && typeof response.results === "object" ? [response.results] : [];
      const row = values.find((value) => value && typeof value === "object") as Record<string, unknown> | undefined;
      if (!row) throw new ProviderError(this.name, "NOT_FOUND", "Snapshot Massive non disponibile.", false, 404);
      const data = mapUnifiedSnapshot(row, symbol);
      return providerResult(this.name, data, { sourceTimestamp: data.asOf, freshness: "realtime", freshnessType: "NEAR_REALTIME", quality: "verified" });
    } catch (error) {
      if (!(error instanceof ProviderError) || !["UNAUTHORIZED", "PLAN_RESTRICTED", "NOT_FOUND"].includes(error.code)) throw error;
      const aggregate = await aggregateQuote(symbol);
      return providerResult(this.name, aggregate.data, { sourceTimestamp: aggregate.data.asOf, freshness: aggregate.delayed ? "delayed" : "realtime", freshnessType: aggregate.delayed ? "DELAYED" : "NEAR_REALTIME", quality: "verified" });
    }
  }

  async getQuotes(symbols: string[]) {
    const results = await Promise.allSettled(symbols.slice(0, 20).map((symbol) => this.getQuote(symbol)));
    const data = results.flatMap((result) => result.status === "fulfilled" ? [result.value.data] : []);
    if (!data.length) throw new ProviderError(this.name, "NOT_FOUND", "Nessuno snapshot Massive disponibile.", false, 404);
    const sourceTimestamp = data.map((quote) => quote.asOf).filter((value): value is string => Boolean(value)).sort().at(-1) ?? null;
    return providerResult(this.name, data, { sourceTimestamp, freshness: "realtime", freshnessType: "NEAR_REALTIME", quality: data.length === symbols.length ? "verified" : "partial" });
  }

  async getHistoricalBars(symbolInput: string, range: ChartRange, intervalInput?: string | null) {
    const symbol = normalizeSymbol(symbolInput);
    if (!this.supportsSymbol(symbol)) throw new ProviderError(this.name, "UNSUPPORTED_SYMBOL", "Simbolo non supportato dall'adapter Massive.", false, 422);
    const interval = (intervalInput ?? defaultIntervals[range]) as ChartInterval;
    const mapped = intervalMap[interval];
    if (!mapped) throw new ProviderError(this.name, "NOT_FOUND", "Intervallo Massive non supportato.", false, 400);
    const response = await massiveGet(`/v2/aggs/ticker/${encodeURIComponent(massiveSymbol(symbol))}/range/${mapped.multiplier}/${mapped.timespan}/${fromDate(range)}/${new Date().toISOString().slice(0, 10)}`, { adjusted: true, sort: "asc", limit: 50_000 }, "historical-bars");
    const results = Array.isArray(response.results) ? response.results : [];
    const points = results.flatMap((value) => {
      if (!value || typeof value !== "object") return [];
      const row = value as Record<string, unknown>;
      const timestamp = timestampToIso(massiveNumber(row, "t")); const open = massiveNumber(row, "o"); const high = massiveNumber(row, "h"); const low = massiveNumber(row, "l"); const close = massiveNumber(row, "c"); const volume = massiveNumber(row, "v");
      if (!timestamp || open === null || high === null || low === null || close === null || volume === null) return [];
      return [{ timestamp, open, high, low, close, volume }];
    });
    if (!points.length) throw new ProviderError(this.name, "NOT_FOUND", "Storico Massive non disponibile.", false, 404);
    const data: MarketChartDto = { symbol, currency: "USD", exchange: isCrypto(symbol) ? "CRYPTO" : "US", range, interval, previousClose: points.at(-2)?.close ?? null, isDelayed: false, asOf: points.at(-1)?.timestamp ?? null, points, source: "massive" };
    return providerResult(this.name, data, { sourceTimestamp: data.asOf, freshness: "realtime", freshnessType: range === "1D" || range === "5D" ? "NEAR_REALTIME" : "END_OF_DAY" });
  }

  async getMarketStatus(market = "US") {
    if (market.toUpperCase() === "CRYPTO") {
      const now = new Date().toISOString();
      return providerResult(this.name, { market: "CRYPTO", state: "open", asOf: now, nextOpen: null, nextClose: null } satisfies MarketStatus, { sourceTimestamp: now, freshness: "realtime", freshnessType: "REALTIME", delaySeconds: 0 });
    }
    const response = await massiveGet("/v1/marketstatus/now", {}, "market-status");
    const status = massiveString(response, "market") ?? "unknown";
    const data: MarketStatus = { market: "US", state: status === "open" ? "open" : status === "extended-hours" ? "extended" : status === "closed" ? "closed" : "unknown", asOf: massiveString(response, "serverTime") ?? new Date().toISOString(), nextOpen: null, nextClose: null };
    return providerResult(this.name, data, { sourceTimestamp: data.asOf, freshness: "realtime", freshnessType: "REALTIME" });
  }
}
