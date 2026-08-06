import type { ProviderNewsItem } from "@/providers";

export const NEWS_INTELLIGENCE_MODEL_VERSION = "news-intelligence-v1.0.0";
export type NewsEventType = "EARNINGS" | "GUIDANCE" | "M_AND_A" | "PRODUCT" | "REGULATORY" | "LEGAL" | "ANALYST" | "MACRO" | "GEOPOLITICS" | "MARKET" | "OTHER";
export type NewsSentiment = "NEGATIVE" | "NEUTRAL" | "POSITIVE" | "MIXED";

export interface NewsIntelligenceItem {
  id: string;
  title: string;
  normalizedTitle: string;
  canonicalUrl: string;
  publisher: string;
  publishedAt: string;
  summary: string | null;
  provider: string;
  relatedSymbols: string[];
  topics: string[];
  eventType: NewsEventType;
  sentiment: NewsSentiment;
  sentimentScore: number;
  relevance: number;
  exposure: "DIRECT" | "SECTOR" | "MACRO";
  expectedDirection: "POSITIVE" | "NEGATIVE" | "MIXED" | "UNKNOWN";
  intensity: "LOW" | "MEDIUM" | "HIGH";
  impactHorizon: "IMMEDIATE" | "SHORT_TERM" | "MEDIUM_TERM";
  sourceReliability: number;
  catalyst: string;
}

export interface NewsIntelligenceAnalysis {
  symbol: string;
  items: NewsIntelligenceItem[];
  aggregate: { averageSentiment: number; positive: number; neutral: number; negative: number; highImpact: number };
  briefing: string[];
  sources: string[];
  rawCount: number;
  deduplicatedCount: number;
  persisted: boolean;
  aiEnrichment: { enabled: boolean; status: "DISABLED" | "NOT_CONFIGURED" | "READY"; reason: string };
  modelVersion: typeof NEWS_INTELLIGENCE_MODEL_VERSION;
  sourceTimestamp: string | null;
  calculatedAt: string;
  disclaimer: string;
}

export interface NewsEngineInput {
  symbol: string;
  provider: string;
  items: ProviderNewsItem[];
}
