import "server-only";

import { getServerEnvironment } from "@/schemas/env";
import { yahooFinanceClient } from "@/services/yahoo/yahoo-finance-client";
import { providerResult } from "../metadata";
import type { NewsProvider, ProviderNewsItem } from "../types";
import { ProviderError } from "../errors";
import { verifiedIssuerByListing } from "@/services/instruments/verified-issuer-registry";

function enrich(item: Awaited<ReturnType<typeof yahooFinanceClient.news>>[number]): ProviderNewsItem {
  return {
    ...item,
    summary: null,
    overallSentimentScore: null,
    overallSentimentLabel: null,
    topics: [],
    tickerSentiment: [],
  };
}

export class YahooNewsAdapter implements NewsProvider {
  readonly name = "yahoo" as const;
  isConfigured() { return getServerEnvironment().YAHOO_FINANCE_ENABLED; }
  async getTickerNews(symbol: string, limit = 12) {
    const issuer = verifiedIssuerByListing(symbol);
    const acceptedSymbols = new Set([symbol, ...(issuer?.listings.flatMap((listing) => [listing.symbol, listing.providerSymbol]) ?? [])].map((value) => value.toUpperCase()));
    const data = (await yahooFinanceClient.news(symbol)).filter((item) => item.relatedSymbols.some((related) => acceptedSymbols.has(related.toUpperCase()))).slice(0, Math.min(50, limit)).map(enrich);
    if (!data.length) throw new ProviderError(this.name, "NOT_FOUND", "Yahoo non ha restituito notizie attribuibili con certezza al ticker richiesto.", false, 404);
    return providerResult(this.name, data, { freshness: "cached", quality: "partial" });
  }
  async getTopicNews(_topics: string[], _limit = 12): Promise<never> {
    void [_topics, _limit];
    throw new Error("Yahoo topic news is not supported by this adapter.");
  }
}
