import "server-only";

import { getServerEnvironment } from "@/schemas/env";
import { yahooFinanceClient } from "@/services/yahoo/yahoo-finance-client";
import { providerResult } from "../metadata";
import type { NewsProvider, ProviderNewsItem } from "../types";

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
    const data = (await yahooFinanceClient.news(symbol)).slice(0, Math.min(50, limit)).map(enrich);
    return providerResult(this.name, data, { freshness: "cached", quality: "partial" });
  }
  async getTopicNews(_topics: string[], _limit = 12): Promise<never> {
    void [_topics, _limit];
    throw new Error("Yahoo topic news is not supported by this adapter.");
  }
}
