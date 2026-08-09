import "server-only";

import { financialProviderRouter } from "@/providers";
import type { AssetIntelligenceKind, AssetIntelligenceReport, MarketChartPoint } from "@/types";
import { normalizeSymbol } from "@/services/yahoo/symbol-resolver";
import { getForecastAnalysis } from "./forecast-service";
import { getSeasonalityAnalysis } from "./seasonality-service";
import { getTechnicalAnalysis } from "./technical-service";
import { getNewsIntelligence } from "@/services/intelligence/news-service";
import { getCryptoDataBundle, getEtfDataBundle } from "@/services/financial/data-bundle-service";

export function classifyAssetIntelligenceKind(symbol: string, quoteType: string): AssetIntelligenceKind | null {
  const type = quoteType.toUpperCase();
  if (symbol.endsWith("-USD") || type.includes("CRYPTO")) return "CRYPTO";
  if (symbol.startsWith("^") || type === "INDEX") return "INDEX";
  if (type === "ETF") return "ETF";
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
  const quote = await financialProviderRouter.quote(symbol);
  const profile = await financialProviderRouter.profile(symbol).catch(() => null);
  const kind = classifyAssetIntelligenceKind(symbol, profile?.data.quoteType ?? quote.data.quoteType);
  if (!kind) return null;
  const benchmark = kind === "CRYPTO" && symbol !== "BTC-USD" ? "BTC-USD" : "^IXIC";
  const [technical, seasonality, news, forecast, priceChart, bitcoinChart, nasdaqChart, specializedBundle] = await Promise.all([
    getTechnicalAnalysis(symbol, "1m", benchmark).catch(() => null),
    getSeasonalityAnalysis(symbol, "20Y").catch(() => null),
    getNewsIntelligence(symbol, 30).catch(() => null),
    getForecastAnalysis(symbol, "1m").catch(() => null),
    financialProviderRouter.analyticsChart(symbol, "1Y", "1d").catch(() => null),
    symbol === "BTC-USD" ? Promise.resolve(null) : financialProviderRouter.analyticsChart("BTC-USD", "1Y", "1d").catch(() => null),
    symbol === "^IXIC" ? Promise.resolve(null) : financialProviderRouter.analyticsChart("^IXIC", "1Y", "1d").catch(() => null),
    kind === "CRYPTO" ? getCryptoDataBundle(symbol).catch(() => null) : kind === "ETF" ? getEtfDataBundle(symbol).catch(() => null) : Promise.resolve(null),
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
  return {
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
}
