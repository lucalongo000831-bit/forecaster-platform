import type { ApiMeta, MarketChartPoint } from "./market-api";

export const TECHNICAL_CHART_MODEL_VERSION = "technical-v1.0.0" as const;

export type TechnicalTimeframe = "1m" | "5m" | "15m" | "30m" | "1h" | "4h" | "1D" | "1W";
export type TechnicalChartType = "candlestick" | "line" | "area";
export type TechnicalPricePolicy = "ADJUSTED_OHLC" | "RAW_OHLC";
export type TechnicalIndicatorKind = "SMA" | "EMA" | "BOLLINGER" | "RSI" | "MACD" | "ATR" | "VWAP" | "VOLUME";

export interface TechnicalIndicatorConfig {
  id: string;
  kind: TechnicalIndicatorKind;
  period?: number;
  color: string;
  enabled: boolean;
}

export interface TechnicalAvailability {
  timeframe: TechnicalTimeframe;
  available: boolean;
  reason: string | null;
  calculated: boolean;
}

export interface TechnicalChartDataset {
  symbol: string;
  currency: string;
  exchange: string;
  timeframe: TechnicalTimeframe;
  modelVersion: typeof TECHNICAL_CHART_MODEL_VERSION;
  pricePolicy: TechnicalPricePolicy;
  bars: MarketChartPoint[];
  availability: TechnicalAvailability[];
  isDelayed: boolean;
  asOf: string | null;
  source: string;
}

export interface TechnicalChartResponse {
  data: TechnicalChartDataset;
  meta: ApiMeta;
}

export interface TechnicalSeriesPoint {
  timestamp: string;
  value: number | null;
}

export interface BollingerSeries {
  middle: Array<number | null>;
  upper: Array<number | null>;
  lower: Array<number | null>;
}

export interface MacdSeries {
  macd: Array<number | null>;
  signal: Array<number | null>;
  histogram: Array<number | null>;
}
