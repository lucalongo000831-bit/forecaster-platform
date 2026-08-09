export type AssetIntelligenceKind = "CRYPTO" | "ETF" | "INDEX";

export interface AssetIntelligenceReport {
  kind: AssetIntelligenceKind;
  symbol: string;
  name: string;
  exchange: string;
  currency: string;
  price: number;
  changePercent: number;
  marketCap: number | null;
  volume: number | null;
  marketState: string;
  provider: string;
  freshnessType: string;
  sourceTimestamp: string | null;
  technical: {
    score: number;
    trend: "BULLISH" | "NEUTRAL" | "BEARISH";
    rsi: number | null;
    macd: number | null;
    sma20: number | null;
    sma50: number | null;
    sma200: number | null;
    volatility: number | null;
    drawdown: number | null;
    support: number | null;
    resistance: number | null;
    relativeVolume: number | null;
  } | null;
  correlations: { bitcoin: number | null; nasdaq: number | null };
  seasonality: { quality: string; years: number; bestMonth: string | null; worstMonth: string | null } | null;
  sentiment: { score: number | null; positive: number; neutral: number; negative: number; provider: string | null };
  forecast: { bear: number; base: number; bull: number; probabilityUp: number; confidence: number; target: number | null; invalidation: number | null; horizon: string } | null;
  assetProfile?: {
    provider: "coingecko" | "finnhub";
    marketCapRank: number | null;
    circulatingSupply: number | null;
    totalSupply: number | null;
    maxSupply: number | null;
    allTimeHigh: number | null;
    allTimeHighDate: string | null;
    assetsUnderManagement: number | null;
    expenseRatio: number | null;
    nav: number | null;
    holdingsCount: number | null;
    topHoldings: Array<{ name: string; symbol: string | null; weight: number | null }>;
  } | null;
  globalContext?: Record<string, number | null> | null;
  unavailable: string[];
  calculatedAt: string;
}
