import "server-only";

import { z } from "zod";
import { getServerEnvironment } from "@/schemas/env";
import { enforceRateLimit } from "@/lib/server/rate-limit";
import { normalizeSymbol } from "@/services/yahoo/symbol-resolver";
import { ProviderError } from "../errors";
import { providerRequest } from "../http";
import { providerResult } from "../metadata";
import type { NewsProvider, ProviderNewsItem } from "../types";

const httpsUrlSchema = z.url().refine((value) => {
  try {
    const url = new URL(value);
    return url.protocol === "https:" && !url.username && !url.password;
  } catch {
    return false;
  }
}, "La fonte news deve utilizzare HTTPS");

const feedItemSchema = z.object({
  title: z.string(),
  url: httpsUrlSchema,
  time_published: z.string(),
  authors: z.array(z.string()).optional(),
  summary: z.string().optional(),
  source: z.string().optional(),
  source_domain: z.string().optional(),
  topics: z.array(z.object({ topic: z.string(), relevance_score: z.string().optional() })).optional(),
  overall_sentiment_score: z.union([z.string(), z.number()]).optional(),
  overall_sentiment_label: z.string().optional(),
  ticker_sentiment: z.array(z.object({
    ticker: z.string(),
    relevance_score: z.string().optional(),
    ticker_sentiment_score: z.string().optional(),
    ticker_sentiment_label: z.string().optional(),
  })).optional(),
});

export const alphaNewsResponseSchema = z.object({
  items: z.union([z.string(), z.number()]).optional(),
  sentiment_score_definition: z.string().optional(),
  relevance_score_definition: z.string().optional(),
  feed: z.array(feedItemSchema).optional(),
  Note: z.string().optional(),
  Information: z.string().optional(),
  "Error Message": z.string().optional(),
});

const ALLOWED_TOPICS = new Set(["blockchain", "earnings", "ipo", "mergers_and_acquisitions", "financial_markets", "economy_fiscal", "economy_monetary", "economy_macro", "energy_transportation", "finance", "life_sciences", "manufacturing", "real_estate", "retail_wholesale", "technology"]);

function numeric(value: string | number | undefined): number | null {
  const parsed = typeof value === "number" ? value : typeof value === "string" ? Number(value) : Number.NaN;
  return Number.isFinite(parsed) ? parsed : null;
}

function alphaTimestamp(value: string): string {
  const match = /^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})$/.exec(value);
  if (!match) return new Date(0).toISOString();
  return new Date(`${match[1]}-${match[2]}-${match[3]}T${match[4]}:${match[5]}:${match[6]}Z`).toISOString();
}

function cleanText(value: string | undefined, maxLength: number): string | null {
  if (!value) return null;
  return value.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim().slice(0, maxLength) || null;
}

export function mapAlphaNewsItem(item: z.infer<typeof feedItemSchema>, index: number): ProviderNewsItem {
  return {
    id: `${item.time_published}-${index}`,
    title: cleanText(item.title, 500) ?? "Senza titolo",
    publisher: cleanText(item.source, 120) ?? new URL(item.url).hostname,
    publishedAt: alphaTimestamp(item.time_published),
    url: item.url,
    relatedSymbols: item.ticker_sentiment?.map((entry) => entry.ticker).slice(0, 25) ?? [],
    summary: cleanText(item.summary, 4_000),
    overallSentimentScore: numeric(item.overall_sentiment_score),
    overallSentimentLabel: cleanText(item.overall_sentiment_label, 80),
    topics: item.topics?.map((topic) => topic.topic).slice(0, 15) ?? [],
    tickerSentiment: item.ticker_sentiment?.slice(0, 25).map((entry) => ({ symbol: entry.ticker, relevance: numeric(entry.relevance_score), score: numeric(entry.ticker_sentiment_score), label: cleanText(entry.ticker_sentiment_label, 80) })) ?? [],
  };
}

export class AlphaVantageNewsAdapter implements NewsProvider {
  readonly name = "alpha-vantage" as const;
  isConfigured() { return Boolean(getServerEnvironment().ALPHA_VANTAGE_API_KEY); }

  private async request(params: { tickers?: string; topics?: string }, limit: number) {
    const env = getServerEnvironment();
    if (!env.ALPHA_VANTAGE_API_KEY) throw new ProviderError(this.name, "NOT_CONFIGURED", "Alpha Vantage non configurato.", false, 503);
    await enforceRateLimit("global", { scope: "provider:alpha-vantage", limit: 4, windowSeconds: 60 });
    const url = new URL("/query", env.ALPHA_VANTAGE_BASE_URL);
    url.searchParams.set("function", "NEWS_SENTIMENT");
    url.searchParams.set("apikey", env.ALPHA_VANTAGE_API_KEY);
    url.searchParams.set("sort", "LATEST");
    url.searchParams.set("limit", String(Math.min(50, Math.max(1, limit))));
    if (params.tickers) url.searchParams.set("tickers", params.tickers);
    if (params.topics) url.searchParams.set("topics", params.topics);
    const response = await providerRequest({ provider: this.name, operation: "news-sentiment", url, schema: alphaNewsResponseSchema, timeoutMs: 15_000, retries: 0 });
    const message = response.Note ?? response.Information ?? response["Error Message"];
    if (message) {
      const rateLimited = /rate|frequency|call limit/i.test(message);
      throw new ProviderError(this.name, rateLimited ? "RATE_LIMITED" : "PLAN_RESTRICTED", rateLimited ? "Quota Alpha Vantage temporaneamente esaurita." : "News Alpha Vantage non disponibili per il piano configurato.", rateLimited, rateLimited ? 429 : 502);
    }
    return response.feed ?? [];
  }

  async getTickerNews(symbolInput: string, limit = 20) {
    const symbol = normalizeSymbol(symbolInput);
    const alphaSymbol = symbol.endsWith("-USD") ? `CRYPTO:${symbol.slice(0, -4)}` : symbol;
    const feed = await this.request({ tickers: alphaSymbol }, limit);
    const data = feed.slice(0, Math.min(50, Math.max(1, limit))).map(mapAlphaNewsItem);
    return providerResult(this.name, data, { sourceTimestamp: data[0]?.publishedAt ?? null, freshness: "cached", quality: data.length ? "verified" : "partial" });
  }

  async getTopicNews(topicInputs: string[], limit = 20) {
    const topics = [...new Set(topicInputs.map((topic) => topic.trim().toLowerCase()).filter((topic) => ALLOWED_TOPICS.has(topic)))].slice(0, 5);
    if (!topics.length) throw new ProviderError(this.name, "NOT_FOUND", "Nessun topic news supportato.", false, 400);
    const feed = await this.request({ topics: topics.join(",") }, limit);
    const data = feed.slice(0, Math.min(50, Math.max(1, limit))).map(mapAlphaNewsItem);
    return providerResult(this.name, data, { sourceTimestamp: data[0]?.publishedAt ?? null, freshness: "cached", quality: data.length ? "verified" : "partial" });
  }
}
