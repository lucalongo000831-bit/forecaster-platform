import "server-only";

import type { ChartInterval, ChartRange, MarketChartDto, MarketQuoteDto, SearchInstrument } from "@/types";
import { instrumentHref, normalizeSearchQuery, normalizeSymbol } from "@/services/yahoo/symbol-resolver";
import { eodhdGet } from "../eodhd/client";
import { fromEodhdSymbol, toEodhdSymbol } from "../eodhd/symbols";
import { ProviderError } from "../errors";
import { providerResult } from "../metadata";
import { arrayValue, isoDate, numericValue, objectValue, textValue } from "../shared";
import type { MarketDataProvider } from "../types";

const DAY = 86_400_000;
function fromDate(range: ChartRange) {
  const now = new Date();
  const days: Record<ChartRange, number> = { "1D": 2, "5D": 7, "1M": 35, "3M": 95, "6M": 190, YTD: 370, "1Y": 370, "5Y": 1_830, "10Y": 3_660, MAX: 18_250 };
  return (range === "YTD" ? new Date(Date.UTC(now.getUTCFullYear(), 0, 1)) : new Date(now.getTime() - days[range] * DAY)).toISOString().slice(0, 10);
}

export class EodhdMarketDataAdapter implements MarketDataProvider {
  readonly name = "eodhd" as const;
  isConfigured() { return Boolean(process.env.EODHD_API_TOKEN); }
  supportsSymbol(symbol: string) { try { return Boolean(toEodhdSymbol(symbol)); } catch { return false; } }

  async searchInstruments(queryInput: string) {
    const query = normalizeSearchQuery(queryInput);
    const raw = await eodhdGet(`search/${encodeURIComponent(query)}`, { limit: 15 }, "search");
    const data = arrayValue(raw).flatMap((value): SearchInstrument[] => {
      const row = objectValue(value); const code = textValue(row, "Code", "code");
      if (!code) return [];
      const exchange = textValue(row, "Exchange", "exchange") ?? "US";
      const symbol = fromEodhdSymbol(code, exchange);
      const rawType = (textValue(row, "Type", "type") ?? "Stock").toLowerCase();
      const type: SearchInstrument["type"] = rawType.includes("etf") || rawType.includes("fund") ? "ETF" : rawType.includes("index") ? "Index" : "Stock";
      return [{ symbol, name: textValue(row, "Name", "name") ?? symbol, type, venue: exchange, price: 0, currency: textValue(row, "Currency", "currency") ?? undefined, href: instrumentHref(symbol, exchange, type), source: "eodhd" }];
    });
    return providerResult(this.name, data, { freshness: "cached", freshnessType: "CACHED", quality: data.length ? "verified" : "partial" });
  }

  async getQuote(symbolInput: string) {
    const symbol = normalizeSymbol(symbolInput); const providerSymbol = toEodhdSymbol(symbol);
    if (!providerSymbol) throw new ProviderError(this.name, "UNSUPPORTED_SYMBOL", "Simbolo non supportato da EODHD.", false, 422);
    const row = objectValue(await eodhdGet(`real-time/${encodeURIComponent(providerSymbol)}`, {}, "quote"));
    const price = numericValue(row, "close", "price");
    if (price === null) throw new ProviderError(this.name, "NOT_FOUND", "Quotazione EODHD non disponibile.", false, 404);
    const previousClose = numericValue(row, "previousClose", "previous_close");
    const change = numericValue(row, "change") ?? (previousClose === null ? 0 : price - previousClose);
    const data: MarketQuoteDto = { symbol, name: symbol, exchange: providerSymbol.split(".").at(-1) ?? "US", quoteType: "EQUITY", currency: "USD", price, change, changePercent: numericValue(row, "change_p", "changePercent") ?? (previousClose ? change / previousClose * 100 : 0), open: numericValue(row, "open"), previousClose, dayLow: numericValue(row, "low"), dayHigh: numericValue(row, "high"), volume: numericValue(row, "volume"), marketCap: null, marketState: "UNKNOWN", asOf: isoDate(numericValue(row, "timestamp")), isDelayed: true, source: "eodhd" };
    return providerResult(this.name, data, { sourceTimestamp: data.asOf, freshness: "delayed", freshnessType: "DELAYED" });
  }

  async getQuotes(symbols: string[]) {
    const settled = await Promise.allSettled(symbols.slice(0, 20).map((symbol) => this.getQuote(symbol)));
    const results = settled.flatMap((item) => item.status === "fulfilled" ? [item.value] : []);
    if (!results.length) throw new ProviderError(this.name, "NOT_FOUND", "Quotazioni EODHD non disponibili.", false, 404);
    return providerResult(this.name, results.map((item) => item.data), { sourceTimestamp: results.map((item) => item.meta.sourceTimestamp).filter(Boolean).sort().at(-1) ?? null, freshness: "delayed", freshnessType: "DELAYED", quality: results.length === symbols.length ? "verified" : "partial" });
  }

  async getHistoricalBars(symbolInput: string, range: ChartRange) {
    const symbol = normalizeSymbol(symbolInput); const providerSymbol = toEodhdSymbol(symbol);
    if (!providerSymbol) throw new ProviderError(this.name, "UNSUPPORTED_SYMBOL", "Simbolo non supportato da EODHD.", false, 422);
    const raw = await eodhdGet(`eod/${encodeURIComponent(providerSymbol)}`, { from: fromDate(range), to: new Date().toISOString().slice(0, 10), period: "d", order: "a" }, "historical-bars");
    const points = arrayValue(raw).flatMap((value) => {
      const row = objectValue(value); const date = textValue(row, "date"); const open = numericValue(row, "open"); const high = numericValue(row, "high"); const low = numericValue(row, "low"); const close = numericValue(row, "close"); const volume = numericValue(row, "volume");
      if (!date || open === null || high === null || low === null || close === null) return [];
      return [{ timestamp: `${date.slice(0, 10)}T00:00:00.000Z`, open, high, low, close, adjustedClose: numericValue(row, "adjusted_close") ?? undefined, volume: volume ?? 0 }];
    });
    if (!points.length) throw new ProviderError(this.name, "NOT_FOUND", "Storico EODHD non disponibile.", false, 404);
    const data: MarketChartDto = { symbol, currency: "USD", exchange: providerSymbol.split(".").at(-1) ?? "US", range, interval: "1d" as ChartInterval, previousClose: points.at(-2)?.close ?? null, isDelayed: true, asOf: points.at(-1)?.timestamp ?? null, points, source: "eodhd" };
    return providerResult(this.name, data, { sourceTimestamp: data.asOf, freshness: "cached", freshnessType: "END_OF_DAY" });
  }

  async getMarketStatus(): Promise<never> { throw new ProviderError(this.name, "PLAN_RESTRICTED", "Stato mercato non esposto da EODHD.", false, 501); }
}
