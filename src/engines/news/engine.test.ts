import { describe, expect, it } from "vitest";
import { analyzeNewsIntelligence } from "./engine";

const item = { id: "1", title: "Apple beats earnings estimates as revenue growth accelerates", publisher: "Wire", publishedAt: "2026-08-06T10:00:00.000Z", url: "https://example.com/story?utm_source=test", relatedSymbols: ["AAPL"], summary: "Strong profit and record services revenue.", overallSentimentScore: null, overallSentimentLabel: null, topics: ["earnings"], tickerSentiment: [] };

describe("news intelligence engine", () => {
  it("canonicalizes, classifies and deduplicates provider metadata", () => {
    const result = analyzeNewsIntelligence({ symbol: "AAPL", provider: "alpha-vantage", items: [item, { ...item, id: "2", url: "https://example.com/story?utm_medium=social" }] });
    expect(result.rawCount).toBe(2);
    expect(result.items).toHaveLength(1);
    expect(result.items[0].eventType).toBe("EARNINGS");
    expect(result.items[0].sentiment).toBe("POSITIVE");
    expect(result.items[0].canonicalUrl).toBe("https://example.com/story");
    expect(result.aiEnrichment.status).toBe("DISABLED");
  });
});
