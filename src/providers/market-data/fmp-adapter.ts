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
    isDelayed: true,
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
    const row = (await fmpGet("quote", { symbol }, "quote"))[0];
    const data = mapQuote(row, symbol);
    return providerResult(this.name, data, { sourceTimestamp: data.asOf, freshness: "delayed" });
  }
  async getQuotes(symbols: string[]) {
    const results = await Promise.allSettled(symbols.slice(0, 20).map((symbol) => this.getQuote(symbol)));
    const data = results.flatMap((result) => result.status === "fulfilled" ? [result.value.data] : []);
    if (!data.length) throw new ProviderError(this.name, "NOT_FOUND", "Nessuna quotazione FMP disponibile.", false, 404);
    return providerResult(this.name, data, { freshness: "delayed", quality: data.length === symbols.length ? "verified" : "partial" });
  }
  async getHistoricalBars(symbolInput: string, range: ChartRange, interval?: string | null) {
    if (interval && !["1d", "5d", "1wk", "1mo"].includes(interval)) {
      throw new ProviderError(this.name, "PLAN_RESTRICTED", "L'adapter FMP fallback espone soltanto barre giornaliere.", false, 501);
    }
    const symbol = normalizeSymbol(symbolInput);
    const rows = await fmpGet("historical-price-eod/full", { symbol, from: rangeStart(range), to: new Date().toISOString().slice(0, 10) }, "historical-bars");
    const points = rows.flatMap((row) => {
      const timestamp = stringValue(row, "date");
      const open = numberValue(row, "open"); const high = numberValue(row, "high"); const low = numberValue(row, "low"); const close = numberValue(row, "close"); const volume = numberValue(row, "volume");
      if (!timestamp || open === null || high === null || low === null || close === null || volume === null) return [];
      return [{ timestamp: new Date(`${timestamp}T00:00:00.000Z`).toISOString(), open, high, low, close, adjustedClose: numberValue(row, "adjClose") ?? undefined, volume }];
    }).sort((a, b) => a.timestamp.localeCompare(b.timestamp));
    if (!points.length) throw new ProviderError(this.name, "NOT_FOUND", "Storico FMP non disponibile.", false, 404);
    const data: MarketChartDto = { symbol, currency: "USD", exchange: marketSlug("market"), range, interval: "1d", previousClose: points.at(-2)?.close ?? null, isDelayed: true, asOf: points.at(-1)?.timestamp ?? null, points, source: "fmp" };
    return providerResult(this.name, data, { sourceTimestamp: data.asOf, freshness: "delayed" });
  }
  async getMarketStatus(): Promise<never> {
    throw new ProviderError(this.name, "PLAN_RESTRICTED", "Stato mercato non disponibile tramite FMP adapter.", false, 501);
  }
}
