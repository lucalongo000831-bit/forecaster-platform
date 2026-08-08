import "server-only";

import { getServerEnvironment } from "@/schemas/env";
import { normalizeSymbol } from "@/services/yahoo/symbol-resolver";
import { fmpGet, stringValue } from "../fmp/client";
import { providerResult } from "../metadata";
import type { NewsProvider, ProviderNewsItem } from "../types";

function mapItem(row: Record<string, unknown>, index: number): ProviderNewsItem | null {
  const title = stringValue(row, "title");
  const url = stringValue(row, "url");
  const publishedAt = stringValue(row, "publishedDate", "date", "publishedAt");
  if (!title || !url || !publishedAt) return null;
  try { const parsed = new URL(url); if (parsed.protocol !== "https:") return null; } catch { return null; }
  const symbols = stringValue(row, "symbol", "symbols")?.split(",").map((item) => item.trim()).filter(Boolean) ?? [];
  return { id: `fmp-${publishedAt}-${index}`, title, publisher: stringValue(row, "site", "publisher") ?? new URL(url).hostname, publishedAt: new Date(publishedAt).toISOString(), url, relatedSymbols: symbols, summary: stringValue(row, "text", "summary"), overallSentimentScore: null, overallSentimentLabel: null, topics: [], tickerSentiment: [] };
}

export class FmpNewsAdapter implements NewsProvider {
  readonly name = "fmp" as const;
  isConfigured() { return Boolean(getServerEnvironment().FMP_API_KEY); }
  async getTickerNews(symbolInput: string, limit = 20) {
    const symbol = normalizeSymbol(symbolInput);
    const crypto = symbol.endsWith("-USD");
    const rows = await fmpGet(crypto ? "news/crypto" : "news/stock", { symbols: crypto ? symbol.replace("-", "") : symbol, page: 0, limit: Math.min(100, Math.max(1, limit)) }, "news");
    const data = rows.flatMap((row, index) => { const mapped = mapItem(row, index); return mapped ? [mapped] : []; });
    return providerResult(this.name, data, { sourceTimestamp: data[0]?.publishedAt ?? null, freshness: "cached", freshnessType: "CACHED", quality: data.length ? "verified" : "partial" });
  }
  async getTopicNews(_topics: string[], limit = 20) {
    const rows = await fmpGet("news/general-latest", { page: 0, limit: Math.min(100, Math.max(1, limit)) }, "market-news");
    const data = rows.flatMap((row, index) => { const mapped = mapItem(row, index); return mapped ? [mapped] : []; });
    return providerResult(this.name, data, { sourceTimestamp: data[0]?.publishedAt ?? null, freshness: "cached", freshnessType: "CACHED", quality: data.length ? "verified" : "partial" });
  }
}
