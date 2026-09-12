import "server-only";

import { cacheGet, cacheSet } from "@/lib/server/redis";
import { structuredLog } from "@/lib/server/logger";
import { withServerTimeout } from "@/lib/server/promise-timeout";
import { createSingleFlight } from "@/lib/server/single-flight";
import { financialProviderRouter } from "@/providers";
import type { AssetIntelligenceKind, AssetIntelligenceReport, MarketChartPoint } from "@/types";
import { normalizeSymbol } from "@/services/yahoo/symbol-resolver";
import { getForecastAnalysis } from "./forecast-service";
import { getSeasonalityAnalysis } from "./seasonality-service";
import { getTechnicalAnalysis } from "./technical-service";
import { getNewsIntelligence } from "@/services/intelligence/news-service";
import { getCryptoDataBundle, getEtfDataBundle } from "@/services/financial/data-bundle-service";

const ASSET_INTELLIGENCE_VERSION = "asset-intelligence-v1.1.0";
const ASSET_CACHE_SECONDS = 60;
const PROFILE_BUDGET_MS = 1_500;
const SECONDARY_BUDGET_MS = 4_500;
const assetIntelligenceFlight = createSingleFlight<string, AssetIntelligenceReport | null>();
const assetCacheKey = (symbol: string) => `asset-intelligence:${ASSET_INTELLIGENCE_VERSION}:${symbol}`;

async function withinOptionalBudget<T>(symbol: string, operation: string, task: Promise<T>, timeoutMs = SECONDARY_BUDGET_MS): Promise<T | null> {
  try {
    return await withServerTimeout(task, timeoutMs, `${operation} exceeded the synchronous analysis budget`);
  } catch (error) {
    structuredLog("warn", "asset-intelligence.secondary_unavailable", {
      symbol,
      operation,
      code: error instanceof Error ? error.name : "UNKNOWN",
    });
    return null;
  }
}

export function classifyAssetIntelligenceKind(symbol: string, quoteType: string, name?: string | null): AssetIntelligenceKind | null {
  const type = quoteType.toUpperCase();
  if (symbol.endsWith("-USD") || type.includes("CRYPTO")) return "CRYPTO";
  if (symbol.startsWith("^") || type === "INDEX") return "INDEX";
  if (type === "ETF" || /\bETF\b|\bEXCHANGE[- ]TRADED FUND\b|\bSPDR\b|\bISHARES\b/i.test(name ?? "")) return "ETF";
  return null;
}

function dailyReturns(points: MarketChartPoint[]) {
  const result = new Map<string, number>();
  for (let index = 1; index < points.length; index += 1) {
    const previous = points[index - 1]?.close; const current = points[index]?.close;
    if (previous && current) result.set(points[index]!.timestamp.slice(0, 10), current / previous - 1);
  }
  return result;
}

export function calculateReturnCorrelation(left: MarketChartPoint[], right: MarketChartPoint[]) {
  const a = dailyReturns(left); const b = dailyReturns(right);
  const pairs = [...a].flatMap(([date, value]) => b.has(date) ? [[value, b.get(date)!] as const] : []).slice(-365);
  if (pairs.length < 20) return null;
  const meanA = pairs.reduce((sum, pair) => sum + pair[0], 0) / pairs.length; const meanB = pairs.reduce((sum, pair) => sum + pair[1], 0) / pairs.length;
  let covariance = 0; let varianceA = 0; let varianceB = 0;
  for (const [valueA, valueB] of pairs) { const deltaA = valueA - meanA; const deltaB = valueB - meanB; covariance += deltaA * deltaB; varianceA += deltaA ** 2; varianceB += deltaB ** 2; }
  return varianceA && varianceB ? covariance / Math.sqrt(varianceA * varianceB) : null;
}

export async function getAssetIntelligence(symbolInput: string): Promise<AssetIntelligenceReport | null> {
  const symbol = normalizeSymbol(decodeURIComponent(symbolInput));
  const cached = await cacheGet<AssetIntelligenceReport>(assetCacheKey(symbol));
  if (cached) return { ...cached, freshnessType: "CACHED" };

  return assetIntelligenceFlight.run(symbol, async () => {
    const rechecked = await cacheGet<AssetIntelligenceReport>(assetCacheKey(symbol));
    if (rechecked) return { ...rechecked, freshnessType: "CACHED" };

    const profileTask = financialProviderRouter.profile(symbol).catch(() => null);
    const quote = await financialProviderRouter.quote(symbol);
    const kind = classifyAssetIntelligenceKind(symbol, quote.data.quoteType, quote.data.name);
    if (!kind) return null;

    const benchmark = kind === "CRYPTO" && symbol !== "BTC-USD" ? "BTC-USD" : "^IXIC";
    const [profile, technical, seasonality, news, forecast, priceChart, bitcoinChart, nasdaqChart, specializedBundle] = await Promise.all([
      withinOptionalBudget(symbol, "profile", profileTask, PROFILE_BUDGET_MS),
      withinOptionalBudget(symbol, "technical", getTechnicalAnalysis(symbol, "1m", benchmark)),
      withinOptionalBudget(symbol, "seasonality", getSeasonalityAnalysis(symbol, "20Y")),
      withinOptionalBudget(symbol, "news", getNewsIntelligence(symbol, 30)),
      withinOptionalBudget(symbol, "forecast", getForecastAnalysis(symbol, "1m")),
      withinOptionalBudget(symbol, "price-correlation-history", financialProviderRouter.analyticsChart(symbol, "1Y", "1d")),
      symbol === "BTC-USD" ? Promise.resolve(null) : withinOptionalBudget(symbol, "bitcoin-correlation-history", financialProviderRouter.analyticsChart("BTC-USD", "1Y", "1d")),
      symbol === "^IXIC" ? Promise.resolve(null) : withinOptionalBudget(symbol, "nasdaq-correlation-history", financialProviderRouter.analyticsChart("^IXIC", "1Y", "1d")),
      kind === "CRYPTO" ? withinOptionalBudget(symbol, "crypto-profile", getCryptoDataBundle(symbol)) : kind === "ETF" ? withinOptionalBudget(symbol, "etf-profile", getEtfDataBundle(symbol)) : Promise.resolve(null),
    ]);
    const analysis = technical?.analysis ?? null;
    const bestMonth = seasonality?.monthly.filter((item) => item.mean !== null).sort((a, b) => (b.mean ?? -Infinity) - (a.mean ?? -Infinity))[0]?.label ?? null;
    const worstMonth = seasonality?.monthly.filter((item) => item.mean !== null).sort((a, b) => (a.mean ?? Infinity) - (b.mean ?? Infinity))[0]?.label ?? null;
    const cryptoBundle = kind === "CRYPTO" && specializedBundle && "global" in specializedBundle ? specializedBundle : null;
    const etfBundle = kind === "ETF" && specializedBundle && "profile" in specializedBundle && !("global" in specializedBundle) ? specializedBundle : null;
    const unavailable = [
      ...(etfBundle?.missing.map((item) => `${item.field}: ${item.message} (${item.reason}).`) ?? (kind === "ETF" ? ["Profilo ETF non disponibile presso il provider configurato."] : [])),
      ...(kind === "INDEX" ? ["Index breadth is not available from the configured providers."] : []),
      ...(cryptoBundle?.missing.map((item) => `${item.field}: ${item.message} (${item.reason}).`) ?? (kind === "CRYPTO" ? ["Fondamentali crypto non disponibili presso CoinGecko."] : [])),
      ...(!technical ? ["Technical history is temporarily unavailable."] : []),
      ...(!news ? ["Attributed news sentiment is temporarily unavailable."] : []),
    ];
    const report: AssetIntelligenceReport = {
      kind, symbol, name: profile?.data.name ?? quote.data.name, exchange: quote.data.exchange, currency: quote.data.currency,
      price: quote.data.price, changePercent: quote.data.changePercent, marketCap: cryptoBundle?.profile?.marketCap ?? quote.data.marketCap, volume: cryptoBundle?.profile?.volume24h ?? quote.data.volume,
      marketState: kind === "CRYPTO" ? "OPEN_24_7" : quote.data.marketState, provider: quote.meta.provider, freshnessType: quote.meta.freshnessType,
      sourceTimestamp: quote.meta.sourceTimestamp,
      technical: analysis ? { score: analysis.score, trend: analysis.trend.score >= 65 ? "BULLISH" : analysis.trend.score <= 35 ? "BEARISH" : "NEUTRAL", rsi: analysis.momentum.rsi14.value, macd: analysis.momentum.macd, sma20: analysis.trend.sma["20"].value, sma50: analysis.trend.sma["50"].value, sma200: analysis.trend.sma["200"].value, volatility: analysis.volatility.annualized20, drawdown: analysis.volatility.maximumDrawdown, support: analysis.structure.support20, resistance: analysis.structure.resistance20, relativeVolume: analysis.volume.relative20 } : null,
      correlations: { bitcoin: priceChart && bitcoinChart ? calculateReturnCorrelation(priceChart.data.points, bitcoinChart.data.points) : symbol === "BTC-USD" ? 1 : null, nasdaq: priceChart && nasdaqChart ? calculateReturnCorrelation(priceChart.data.points, nasdaqChart.data.points) : symbol === "^IXIC" ? 1 : null },
      seasonality: seasonality ? { quality: seasonality.quality, years: seasonality.availableYears, bestMonth, worstMonth } : null,
      sentiment: { score: news?.analysis.aggregate.averageSentiment ?? null, positive: news?.analysis.aggregate.positive ?? 0, neutral: news?.analysis.aggregate.neutral ?? 0, negative: news?.analysis.aggregate.negative ?? 0, provider: news?.meta.provider ?? null },
      forecast: forecast ? { bear: forecast.analysis.percentiles.p10, base: forecast.analysis.percentiles.p50, bull: forecast.analysis.percentiles.p90, probabilityUp: forecast.analysis.probabilityAboveCurrentPrice, confidence: forecast.analysis.confidence, target: analysis?.structure.resistance20 ?? null, invalidation: analysis?.structure.support20 ?? null, horizon: forecast.analysis.horizon } : null,
      assetProfile: cryptoBundle?.profile ? { provider: "coingecko", marketCapRank: cryptoBundle.profile.marketCapRank, circulatingSupply: cryptoBundle.profile.circulatingSupply, totalSupply: cryptoBundle.profile.totalSupply, maxSupply: cryptoBundle.profile.maxSupply, allTimeHigh: cryptoBundle.profile.allTimeHigh, allTimeHighDate: cryptoBundle.profile.allTimeHighDate, assetsUnderManagement: null, expenseRatio: null, nav: null, holdingsCount: null, topHoldings: [] } : etfBundle?.profile ? { provider: "finnhub", marketCapRank: null, circulatingSupply: null, totalSupply: null, maxSupply: null, allTimeHigh: null, allTimeHighDate: null, assetsUnderManagement: etfBundle.profile.assetsUnderManagement, expenseRatio: etfBundle.profile.expenseRatio, nav: etfBundle.profile.nav, holdingsCount: etfBundle.profile.holdings.length, topHoldings: etfBundle.profile.holdings.slice(0, 10).map((holding) => ({ name: holding.name, symbol: holding.symbol, weight: holding.weight })) } : null,
      globalContext: cryptoBundle?.global ?? null,
      unavailable, calculatedAt: new Date().toISOString(),
    };
    await cacheSet(assetCacheKey(symbol), report, ASSET_CACHE_SECONDS);
    return report;
  });
}
