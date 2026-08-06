import type { DataSource, SearchInstrument } from "./finance";

export type ChartRange = "1D" | "5D" | "1M" | "6M" | "YTD" | "1Y" | "5Y" | "MAX";
export type ChartInterval = "1m" | "2m" | "5m" | "15m" | "30m" | "60m" | "90m" | "1h" | "1d" | "5d" | "1wk" | "1mo" | "3mo";

export interface MarketQuoteDto {
  symbol: string;
  name: string;
  exchange: string;
  quoteType: string;
  currency: string;
  price: number;
  change: number;
  changePercent: number;
  open: number | null;
  previousClose: number | null;
  dayLow: number | null;
  dayHigh: number | null;
  volume: number | null;
  marketCap: number | null;
  marketState: string;
  asOf: string | null;
  isDelayed: boolean;
  source: DataSource;
}

export interface MarketChartPoint {
  timestamp: string;
  open: number;
  high: number;
  low: number;
  close: number;
  adjustedClose?: number;
  volume: number;
}

export interface MarketChartDto {
  symbol: string;
  currency: string;
  exchange: string;
  range: ChartRange;
  interval: ChartInterval;
  previousClose: number | null;
  isDelayed: boolean;
  asOf: string | null;
  points: MarketChartPoint[];
  source: DataSource;
}

export interface MarketProfileDto {
  symbol: string;
  name: string;
  exchange: string;
  quoteType: string;
  currency: string;
  country: string | null;
  sector: string | null;
  industry: string | null;
  description: string | null;
  employees: number | null;
  website: string | null;
  source: DataSource;
}

export interface MarketFundamentalsDto {
  symbol: string;
  marketCap: number | null;
  enterpriseValue: number | null;
  trailingEps: number | null;
  trailingPe: number | null;
  forwardPe: number | null;
  priceToBook: number | null;
  dividendRate: number | null;
  dividendYield: number | null;
  returnOnEquity: number | null;
  debtToEquity: number | null;
  profitMargins: number | null;
  revenue: number | null;
  freeCashflow: number | null;
  sharesOutstanding: number | null;
  source: DataSource;
}

export interface MarketNewsDto {
  id: string;
  title: string;
  publisher: string;
  publishedAt: string;
  url: string;
  relatedSymbols: string[];
}

export interface ApiMeta {
  source: DataSource;
  stale: boolean;
  fallback: boolean;
  message?: string;
}

export interface ApiSuccess<T> {
  data: T;
  meta: ApiMeta;
}

export interface ApiError {
  error: { code: string; message: string };
}

export type SearchResponse = ApiSuccess<SearchInstrument[]>;
export type QuoteResponse = ApiSuccess<MarketQuoteDto>;
export type ChartResponse = ApiSuccess<MarketChartDto>;
export type ProfileResponse = ApiSuccess<MarketProfileDto>;
export type FundamentalsResponse = ApiSuccess<MarketFundamentalsDto>;
export type NewsResponse = ApiSuccess<MarketNewsDto[]>;
