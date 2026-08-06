import { clamp, mean } from "@/engines/shared/statistics";
import { NEWS_INTELLIGENCE_MODEL_VERSION, type NewsEngineInput, type NewsEventType, type NewsIntelligenceAnalysis, type NewsIntelligenceItem, type NewsSentiment } from "./types";

const positiveWords = new Set(["beat", "beats", "growth", "gain", "gains", "upgrade", "record", "surge", "strong", "profit", "profits", "partnership", "approval", "launch", "expands", "raises", "success"]);
const negativeWords = new Set(["miss", "misses", "loss", "losses", "downgrade", "cut", "cuts", "probe", "lawsuit", "decline", "falls", "weak", "warning", "recall", "fraud", "risk", "layoff"]);
const trackingParameters = new Set(["fbclid", "gclid", "guccounter", "guce_referrer", "guce_referrer_sig"]);

function canonicalizeUrl(value: string) {
  const url = new URL(value);
  for (const key of [...url.searchParams.keys()]) if (key.toLowerCase().startsWith("utm_") || trackingParameters.has(key.toLowerCase())) url.searchParams.delete(key);
  url.hash = "";
  return url.toString();
}

function normalizeTitle(value: string) { return value.toLowerCase().normalize("NFKD").replace(/[^a-z0-9\s]/g, " ").replace(/\s+/g, " ").trim(); }
function words(value: string) { return value.toLowerCase().match(/[a-z]+/g) ?? []; }
function jaccard(left: string, right: string) { const a = new Set(words(left)); const b = new Set(words(right)); const union = new Set([...a, ...b]); if (!union.size) return 0; return [...a].filter((word) => b.has(word)).length / union.size; }
function lexicalSentiment(value: string) { const tokens = words(value); const score = tokens.reduce((sum, token) => sum + (positiveWords.has(token) ? 1 : negativeWords.has(token) ? -1 : 0), 0); return clamp(score / Math.max(3, Math.sqrt(tokens.length) * 2), -1, 1); }
function sentimentLabel(score: number): NewsSentiment { return score >= 0.18 ? "POSITIVE" : score <= -0.18 ? "NEGATIVE" : "NEUTRAL"; }

function classify(value: string, topics: string[]): NewsEventType {
  const text = `${value} ${topics.join(" ")}`.toLowerCase();
  const rules: Array<[NewsEventType, RegExp]> = [
    ["EARNINGS", /earnings|revenue|profit|eps|quarter|results/], ["GUIDANCE", /guidance|outlook|forecast/], ["M_AND_A", /merger|acquisition|takeover|buyout/],
    ["REGULATORY", /regulator|antitrust|sec |ftc |approval|ban|tariff/], ["LEGAL", /lawsuit|court|settlement|probe|investigation/], ["ANALYST", /analyst|upgrade|downgrade|price target/],
    ["PRODUCT", /launch|product|platform|chip|model|service/], ["GEOPOLITICS", /war|sanction|geopolit|conflict|election/], ["MACRO", /inflation|interest rate|central bank|economy|gdp|employment/], ["MARKET", /market|stocks|bonds|commodit|currency/],
  ];
  return rules.find(([, pattern]) => pattern.test(text))?.[0] ?? "OTHER";
}

function stableId(value: string) { let hash = 2166136261; for (const character of value) { hash ^= character.charCodeAt(0); hash = Math.imul(hash, 16777619); } return `news-${(hash >>> 0).toString(16)}`; }

export function analyzeNewsIntelligence(input: NewsEngineInput): NewsIntelligenceAnalysis {
  const mapped: NewsIntelligenceItem[] = input.items.flatMap((item) => {
    let canonicalUrl: string;
    try { canonicalUrl = canonicalizeUrl(item.url); } catch { return []; }
    const normalizedTitle = normalizeTitle(item.title);
    if (!normalizedTitle) return [];
    const ticker = item.tickerSentiment.find((entry) => entry.symbol.toUpperCase() === input.symbol.toUpperCase());
    const providerScore = ticker?.score ?? item.overallSentimentScore;
    const sentimentScore = clamp(providerScore ?? lexicalSentiment(`${item.title} ${item.summary ?? ""}`), -1, 1);
    const eventType = classify(`${item.title} ${item.summary ?? ""}`, item.topics);
    const relevance = clamp(ticker?.relevance ?? (item.relatedSymbols.some((symbol) => symbol.toUpperCase() === input.symbol.toUpperCase()) ? 0.85 : 0.45), 0, 1);
    const sentiment = sentimentLabel(sentimentScore);
    const intensity: NewsIntelligenceItem["intensity"] = Math.abs(sentimentScore) >= 0.55 && relevance >= 0.65 ? "HIGH" : Math.abs(sentimentScore) >= 0.22 ? "MEDIUM" : "LOW";
    const exposure: NewsIntelligenceItem["exposure"] = relevance >= 0.65 ? "DIRECT" : ["MACRO", "GEOPOLITICS", "MARKET"].includes(eventType) ? "MACRO" : "SECTOR";
    const expectedDirection: NewsIntelligenceItem["expectedDirection"] = sentiment === "POSITIVE" ? "POSITIVE" : sentiment === "NEGATIVE" ? "NEGATIVE" : sentiment === "MIXED" ? "MIXED" : "UNKNOWN";
    const impactHorizon: NewsIntelligenceItem["impactHorizon"] = ["EARNINGS", "GUIDANCE", "M_AND_A", "LEGAL"].includes(eventType) ? "IMMEDIATE" : ["PRODUCT", "REGULATORY", "ANALYST"].includes(eventType) ? "SHORT_TERM" : "MEDIUM_TERM";
    return [{ id: stableId(canonicalUrl), title: item.title, normalizedTitle, canonicalUrl, publisher: item.publisher, publishedAt: item.publishedAt, summary: item.summary, provider: input.provider, relatedSymbols: item.relatedSymbols, topics: item.topics, eventType, sentiment, sentimentScore, relevance, exposure, expectedDirection, intensity, impactHorizon, sourceReliability: clamp(0.55 + (item.summary ? 0.1 : 0) + (providerScore !== null ? 0.15 : 0) + (canonicalUrl.startsWith("https://") ? 0.1 : 0), 0, 1), catalyst: `${eventType.replaceAll("_", " ")} · ${exposure.toLowerCase()} exposure` }];
  }).sort((a, b) => b.publishedAt.localeCompare(a.publishedAt));
  const unique: NewsIntelligenceItem[] = [];
  for (const item of mapped) {
    const duplicate = unique.some((existing) => existing.canonicalUrl === item.canonicalUrl || (Math.abs(new Date(existing.publishedAt).getTime() - new Date(item.publishedAt).getTime()) < 48 * 60 * 60_000 && jaccard(existing.normalizedTitle, item.normalizedTitle) >= 0.82));
    if (!duplicate) unique.push(item);
  }
  const sentiments = unique.map((item) => item.sentimentScore);
  const positive = unique.filter((item) => item.sentiment === "POSITIVE").length; const negative = unique.filter((item) => item.sentiment === "NEGATIVE").length; const neutral = unique.length - positive - negative;
  const averageSentiment = mean(sentiments) ?? 0;
  const dominantType = Object.entries(unique.reduce<Record<string, number>>((counts, item) => ({ ...counts, [item.eventType]: (counts[item.eventType] ?? 0) + 1 }), {})).sort((a, b) => b[1] - a[1])[0]?.[0] ?? "OTHER";
  const briefing = unique.length ? [
    `${unique.length} articoli unici su ${input.symbol}; ${positive} positivi, ${negative} negativi e ${neutral} neutrali.`,
    `Sentiment aggregato ${averageSentiment >= 0.18 ? "positivo" : averageSentiment <= -0.18 ? "negativo" : "neutrale"} (${averageSentiment.toFixed(2)}), con categoria prevalente ${dominantType.replaceAll("_", " ")}.`,
  ] : [];
  return { symbol: input.symbol, items: unique, aggregate: { averageSentiment, positive, neutral, negative, highImpact: unique.filter((item) => item.intensity === "HIGH").length }, briefing, sources: [...new Set(unique.map((item) => `${item.publisher} · ${item.provider}`))], rawCount: input.items.length, deduplicatedCount: unique.length, persisted: false, aiEnrichment: { enabled: false, status: "DISABLED", reason: "Arricchimento AI disattivato: il modello deterministico non aggiunge fatti alle fonti." }, modelVersion: NEWS_INTELLIGENCE_MODEL_VERSION, sourceTimestamp: unique[0]?.publishedAt ?? null, calculatedAt: new Date().toISOString(), disclaimer: "Classificazione e sentiment sono euristiche informative. Aprire sempre la fonte originale e verificare data, contesto e affidabilità." };
}
