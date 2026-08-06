import type {
  MarketChartDto,
  MarketFundamentalsDto,
  MarketNewsDto,
  MarketProfileDto,
  MarketQuoteDto,
  SearchInstrument,
} from "@/types";

export type ProviderName = "yahoo" | "fmp" | "alpha-vantage" | "massive";
export type DataFreshness = "realtime" | "delayed" | "cached" | "stale";
export type DataQuality = "verified" | "partial" | "estimated" | "unavailable";

export interface ProviderMetadata {
  provider: ProviderName;
  fetchedAt: string;
  sourceTimestamp: string | null;
  freshness: DataFreshness;
  quality: DataQuality;
  isFallback: boolean;
}

export interface ProviderResult<T> {
  data: T;
  meta: ProviderMetadata;
}

export type StatementKind = "income" | "balance-sheet" | "cash-flow";
export type StatementPeriod = "annual" | "quarter";

export interface FinancialStatement {
  symbol: string;
  kind: StatementKind;
  period: StatementPeriod;
  fiscalDate: string;
  reportedCurrency: string | null;
  acceptedAt: string | null;
  values: Record<string, number | null>;
}

export interface FundamentalRatios {
  symbol: string;
  period: string;
  date: string | null;
  values: Record<string, number | null>;
}

export interface AnalystConsensus {
  symbol: string;
  targetLow: number | null;
  targetHigh: number | null;
  targetMedian: number | null;
  targetConsensus: number | null;
  analystCount: number | null;
  currency: string | null;
  asOf: string | null;
}

export interface EarningsEvent {
  symbol: string;
  date: string;
  time: string | null;
  estimatedEps: number | null;
  actualEps: number | null;
  estimatedRevenue: number | null;
  actualRevenue: number | null;
  currency: string | null;
}

export interface DividendEvent {
  symbol: string;
  date: string;
  recordDate: string | null;
  paymentDate: string | null;
  declarationDate: string | null;
  amount: number | null;
  adjustedAmount: number | null;
  yield: number | null;
  frequency: string | null;
  currency: string | null;
}

export interface EconomicEvent {
  date: string;
  country: string | null;
  event: string;
  currency: string | null;
  previous: number | null;
  estimate: number | null;
  actual: number | null;
  impact: string | null;
  unit: string | null;
}

export interface ProviderNewsItem extends MarketNewsDto {
  summary: string | null;
  overallSentimentScore: number | null;
  overallSentimentLabel: string | null;
  topics: string[];
  tickerSentiment: Array<{
    symbol: string;
    relevance: number | null;
    score: number | null;
    label: string | null;
  }>;
}

export interface MarketStatus {
  market: string;
  state: "open" | "closed" | "extended" | "unknown";
  asOf: string;
  nextOpen: string | null;
  nextClose: string | null;
}

export interface MarketDataProvider {
  readonly name: ProviderName;
  isConfigured(): boolean;
  supportsSymbol(symbol: string): boolean;
  searchInstruments(query: string): Promise<ProviderResult<SearchInstrument[]>>;
  getQuote(symbol: string): Promise<ProviderResult<MarketQuoteDto>>;
  getQuotes(symbols: string[]): Promise<ProviderResult<MarketQuoteDto[]>>;
  getHistoricalBars(symbol: string, range: MarketChartDto["range"], interval?: string | null): Promise<ProviderResult<MarketChartDto>>;
  getMarketStatus(market?: string): Promise<ProviderResult<MarketStatus>>;
}

export interface FundamentalsProvider {
  readonly name: ProviderName;
  isConfigured(): boolean;
  supportsSymbol(symbol: string): boolean;
  getCompanyProfile(symbol: string): Promise<ProviderResult<MarketProfileDto>>;
  getFundamentals(symbol: string): Promise<ProviderResult<MarketFundamentalsDto>>;
  getStatements(symbol: string, kind: StatementKind, period: StatementPeriod, limit?: number): Promise<ProviderResult<FinancialStatement[]>>;
  getRatios(symbol: string, period: StatementPeriod, limit?: number): Promise<ProviderResult<FundamentalRatios[]>>;
  getAnalystConsensus(symbol: string): Promise<ProviderResult<AnalystConsensus>>;
  getEarningsCalendar(from: string, to: string, symbol?: string): Promise<ProviderResult<EarningsEvent[]>>;
  getDividendCalendar(from: string, to: string, symbol?: string): Promise<ProviderResult<DividendEvent[]>>;
  getEconomicCalendar(from: string, to: string): Promise<ProviderResult<EconomicEvent[]>>;
}

export interface NewsProvider {
  readonly name: ProviderName;
  isConfigured(): boolean;
  getTickerNews(symbol: string, limit?: number): Promise<ProviderResult<ProviderNewsItem[]>>;
  getTopicNews(topics: string[], limit?: number): Promise<ProviderResult<ProviderNewsItem[]>>;
}

export interface ProviderCapability {
  provider: ProviderName;
  configured: boolean;
  capabilities: string[];
  limitations: string[];
}
