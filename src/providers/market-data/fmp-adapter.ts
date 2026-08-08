import "server-only";

import { getServerEnvironment } from "@/schemas/env";
import type { ChartRange, MarketChartDto, MarketQuoteDto, SearchInstrument } from "@/types";
import { instrumentHref, marketSlug, normalizeSearchQuery, normalizeSymbol } from "@/services/yahoo/symbol-resolver";
import { ProviderError } from "../errors";
import { providerResult } from "../metadata";
import type { MarketDataProvider } from "../types";
import { booleanValue, fmpGet, numberValue, stringValue } from "../fmp/client";

const DAY = 86_400_000;

function rangeStart(range: ChartRange): string {
  const now = new Date();
  const days: Record<ChartRange, number> = { "1D": 2, "5D": 7, "1M": 35, "3M": 95, "6M": 190, YTD: 370, "1Y": 370, "5Y": 1_830, "10Y": 3_660, MAX: 18_250 };
  const date = range === "YTD" ? new Date(Date.UTC(now.getUTCFullYear(), 0, 1)) : new Date(now.getTime() - days[range] * DAY);
  return date.toISOString().slice(0, 10);
}

function searchType(value: string | null): SearchInstrument["type"] {
  const normalized = value?.toLowerCase() ?? "";
  if (normalized.includes("etf") || normalized.includes("fund")) return "ETF";
  if (normalized.includes("index")) return "Index";
  if (normalized.includes("crypto")) return "Crypto";
  return "Stock";
}

function fmpSymbol(symbol: string) { return symbol.endsWith("-USD") ? symbol.replace("-", "") : symbol; }

function mapQuote(record: Record<string, unknown>, requestedSymbol: string): MarketQuoteDto {
  const symbol = stringValue(record, "symbol") ?? requestedSymbol;
  const price = numberValue(record, "price");
  if (price === null) throw new ProviderError("fmp", "NOT_FOUND", "Quotazione FMP non disponibile.", false, 404);
  const timestamp = numberValue(record, "timestamp");
  return {
    symbol,
    name: stringValue(record, "name") ?? symbol,
    exchange: stringValue(record, "exchange", "exchangeShortName") ?? "—",
    quoteType: stringValue(record, "type") ?? "EQUITY",
    currency: stringValue(record, "currency") ?? "USD",
    price,
    change: numberValue(record, "change") ?? 0,
    changePercent: numberValue(record, "changePercentage", "changesPercentage") ?? 0,
    open: numberValue(record, "open"),
    previousClose: numberValue(record, "previousClose"),
    dayLow: numberValue(record, "dayLow"),
    dayHigh: numberValue(record, "dayHigh"),
    volume: numberValue(record, "volume"),
    marketCap: numberValue(record, "marketCap"),
    marketState: booleanValue(record, "isMarketOpen") === true ? "REGULAR" : "CLOSED",
    asOf: timestamp ? new Date(timestamp * 1_000).toISOString() : null,
    isDelayed: false,
    source: "fmp",
  };
}

export class FmpMarketDataAdapter implements MarketDataProvider {
  readonly name = "fmp" as const;
  isConfigured() { return Boolean(getServerEnvironment().FMP_API_KEY); }
  supportsSymbol(symbol: string) {
    try { normalizeSymbol(symbol); return !symbol.startsWith("^") && !symbol.includes("="); } catch { return false; }
  }
  async searchInstruments(queryInput: string) {
    const query = normalizeSearchQuery(queryInput);
    const rows = await fmpGet("search-name", { query, limit: 12 }, "search");
    const data = rows.flatMap((row): SearchInstrument[] => {
      const symbol = stringValue(row, "symbol");
      if (!symbol) return [];
      const exchange = stringValue(row, "exchange", "exchangeShortName") ?? "—";
      const type = searchType(stringValue(row, "type"));
      return [{ symbol, name: stringValue(row, "name") ?? symbol, type, venue: exchange, price: 0, currency: stringValue(row, "currency") ?? undefined, href: instrumentHref(symbol, exchange, type), source: "fmp" }];
    });
    return providerResult(this.name, data, { freshness: "cached", quality: data.length ? "verified" : "partial" });
  }
  async getQuote(symbolInput: string) {
    const symbol = normalizeSymbol(symbolInput);
    const row = (await fmpGet("quote", { symbol: fmpSymbol(symbol) }, "quote"))[0];
    const data = mapQuote(row, symbol);
    data.symbol = symbol;
    data.quoteType = symbol.endsWith("-USD") ? "CRYPTOCURRENCY" : data.quoteType;
    return providerResult(this.name, data, { sourceTimestamp: data.asOf, freshness: "realtime", freshnessType: "NEAR_REALTIME" });
  }
  async getQuotes(symbols: string[]) {
    const requested = symbols.slice(0, 50).map(normalizeSymbol);
    const rows = await fmpGet("batch-quote", { symbols: requested.map(fmpSymbol).join(",") }, "batch-quote");
    const byProviderSymbol = new Map(rows.map((row) => [stringValue(row, "symbol"), row]));
    const data = requested.flatMap((symbol) => {
      const row = byProviderSymbol.get(fmpSymbol(symbol));
      if (!row) return [];
      const quote = mapQuote(row, symbol); quote.symbol = symbol; quote.quoteType = symbol.endsWith("-USD") ? "CRYPTOCURRENCY" : quote.quoteType;
      return [quote];
    });
    if (!data.length) throw new ProviderError(this.name, "NOT_FOUND", "Nessuna quotazione FMP disponibile.", false, 404);
    const sourceTimestamp = data.map((quote) => quote.asOf).filter((value): value is string => Boolean(value)).sort().at(-1) ?? null;
    return providerResult(this.name, data, { sourceTimestamp, freshness: "realtime", freshnessType: "NEAR_REALTIME", quality: data.length === symbols.length ? "verified" : "partial" });
  }
  async getHistoricalBars(symbolInput: string, range: ChartRange, interval?: string | null) {
    const symbol = normalizeSymbol(symbolInput);
    const requestedInterval = interval ?? (range === "1D" ? "5m" : range === "5D" ? "15m" : "1d");
    const intradayEndpoint: Record<string, string> = { "1m": "1min", "5m": "5min", "15m": "15min", "30m": "30min", "60m": "1hour", "1h": "1hour" };
    const endpoint = intradayEndpoint[requestedInterval] ? `historical-chart/${intradayEndpoint[requestedInterval]}` : "historical-price-eod/full";
    const rows = await fmpGet(endpoint, { symbol: fmpSymbol(symbol), from: rangeStart(range), to: new Date().toISOString().slice(0, 10) }, "historical-bars");
    const points = rows.flatMap((row) => {
      const timestamp = stringValue(row, "date");
      const open = numberValue(row, "open"); const high = numberValue(row, "high"); const low = numberValue(row, "low"); const close = numberValue(row, "close"); const volume = numberValue(row, "volume");
      if (!timestamp || open === null || high === null || low === null || close === null || volume === null) return [];
      const normalizedTimestamp = timestamp.includes("T") || timestamp.includes(" ") ? new Date(timestamp.replace(" ", "T") + (timestamp.endsWith("Z") ? "" : "Z")).toISOString() : new Date(`${timestamp}T00:00:00.000Z`).toISOString();
      return [{ timestamp: normalizedTimestamp, open, high, low, close, adjustedClose: numberValue(row, "adjClose") ?? undefined, volume }];
    }).sort((a, b) => a.timestamp.localeCompare(b.timestamp));
    if (!points.length) throw new ProviderError(this.name, "NOT_FOUND", "Storico FMP non disponibile.", false, 404);
    const normalizedInterval = (intradayEndpoint[requestedInterval] ? requestedInterval : "1d") as MarketChartDto["interval"];
    const data: MarketChartDto = { symbol, currency: "USD", exchange: symbol.endsWith("-USD") ? "CRYPTO" : marketSlug("market"), range, interval: normalizedInterval, previousClose: points.at(-2)?.close ?? null, isDelayed: false, asOf: points.at(-1)?.timestamp ?? null, points, source: "fmp" };
    return providerResult(this.name, data, { sourceTimestamp: data.asOf, freshness: intradayEndpoint[requestedInterval] ? "realtime" : "cached", freshnessType: intradayEndpoint[requestedInterval] ? "NEAR_REALTIME" : "END_OF_DAY" });
  }
  async getMarketStatus(): Promise<never> {
    throw new ProviderError(this.name, "PLAN_RESTRICTED", "Stato mercato non disponibile tramite FMP adapter.", false, 501);
  }
}
