import "server-only";

import { getServerEnvironment } from "@/schemas/env";
import { yahooFinanceClient } from "@/services/yahoo/yahoo-finance-client";
import { normalizeSymbol } from "@/services/yahoo/symbol-resolver";
import { providerResult } from "../metadata";
import type { MarketDataProvider, MarketStatus, ProviderResult } from "../types";

export class YahooMarketDataAdapter implements MarketDataProvider {
  readonly name = "yahoo" as const;

  isConfigured() {
    return getServerEnvironment().YAHOO_FINANCE_ENABLED;
  }

  supportsSymbol(symbol: string) {
    try {
      normalizeSymbol(symbol);
      return true;
    } catch {
      return false;
    }
  }

  async searchInstruments(query: string) {
    return providerResult(this.name, await yahooFinanceClient.search(query), { freshness: "cached" });
  }

  async getQuote(symbol: string) {
    const data = await yahooFinanceClient.quote(symbol);
    return providerResult(this.name, data, {
      sourceTimestamp: data.asOf,
      freshness: data.isDelayed ? "delayed" : "realtime",
    });
  }

  async getQuotes(symbols: string[]) {
    const data = await yahooFinanceClient.quotes(symbols);
    const timestamps = data.flatMap((quote) => quote.asOf ? [quote.asOf] : []).sort();
    return providerResult(this.name, data, {
      sourceTimestamp: timestamps.at(-1) ?? null,
      freshness: data.some((quote) => quote.isDelayed) ? "delayed" : "realtime",
      quality: data.length === symbols.length ? "verified" : "partial",
    });
  }

  async getHistoricalBars(symbol: string, range: Parameters<MarketDataProvider["getHistoricalBars"]>[1], interval?: string | null) {
    const data = await yahooFinanceClient.chart(symbol, range, interval);
    return providerResult(this.name, data, {
      sourceTimestamp: data.asOf,
      freshness: data.isDelayed ? "delayed" : "cached",
    });
  }

  async getMarketStatus(): Promise<ProviderResult<MarketStatus>> {
    const quote = await yahooFinanceClient.quote("^GSPC");
    const state = quote.marketState === "REGULAR"
      ? "open"
      : quote.marketState === "PRE" || quote.marketState === "POST"
        ? "extended"
        : quote.marketState
          ? "closed"
          : "unknown";
    return providerResult(this.name, {
      market: "US",
      state,
      asOf: quote.asOf ?? new Date().toISOString(),
      nextOpen: null,
      nextClose: null,
    }, { sourceTimestamp: quote.asOf, freshness: quote.isDelayed ? "delayed" : "realtime" });
  }
}
