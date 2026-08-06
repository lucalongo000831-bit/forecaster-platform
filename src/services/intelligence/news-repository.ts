import "server-only";

import { getDatabase, isDatabaseConfigured, newsItems } from "@/db";
import { structuredLog } from "@/lib/server/logger";
import type { NewsIntelligenceAnalysis } from "@/engines/news";

export async function persistNewsIntelligence(analysis: NewsIntelligenceAnalysis) {
  if (!isDatabaseConfigured() || !analysis.items.length) return false;
  try {
    const database = getDatabase();
    for (const item of analysis.items) {
      await database.insert(newsItems).values({ canonicalUrl: item.canonicalUrl, normalizedTitle: item.normalizedTitle, title: item.title, publisher: item.publisher, publishedAt: new Date(item.publishedAt), summary: item.summary, sentiment: String(item.sentimentScore), relevance: String(item.relevance), classification: { eventType: item.eventType, exposure: item.exposure, expectedDirection: item.expectedDirection, intensity: item.intensity, impactHorizon: item.impactHorizon, sourceReliability: item.sourceReliability, symbol: analysis.symbol }, provider: item.provider, providerRecordId: item.id, sourceTimestamp: new Date(item.publishedAt), calculatedAt: new Date(analysis.calculatedAt), modelVersion: analysis.modelVersion, quality: "PARTIAL", freshness: "CACHED", metadata: { relatedSymbols: item.relatedSymbols, topics: item.topics } }).onConflictDoUpdate({ target: newsItems.canonicalUrl, set: { title: item.title, summary: item.summary, sentiment: String(item.sentimentScore), relevance: String(item.relevance), classification: { eventType: item.eventType, exposure: item.exposure, expectedDirection: item.expectedDirection, intensity: item.intensity, impactHorizon: item.impactHorizon, sourceReliability: item.sourceReliability, symbol: analysis.symbol }, updatedAt: new Date() } });
    }
    return true;
  } catch (error) {
    structuredLog("warn", "news.persistence.failed", { code: error instanceof Error ? error.name : "UNKNOWN", items: analysis.items.length });
    return false;
  }
}
