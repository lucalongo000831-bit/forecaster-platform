import type { ApiMeta, MarketChartPoint } from "./market-api";

export const TECHNICAL_V1_MODEL_VERSION = "technical-v1.0.0" as const;
export const TECHNICAL_CHART_MODEL_VERSION = "technical-v2.0.0" as const;

export type TechnicalTimeframe = "1m" | "5m" | "15m" | "30m" | "1h" | "4h" | "1D" | "1W";
export type TechnicalChartType = "candlestick" | "line" | "area" | "heikin-ashi";
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

export type TechnicalCapability =
  | "HEIKIN_ASHI"
  | "FIB_RETRACEMENT"
  | "FIB_EXTENSION"
  | "AUTO_SUPPORT_RESISTANCE"
  | "VOLUME_PROFILE"
  | "ANCHORED_VWAP"
  | "MULTI_CHART"
  | "ADVANCED_DRAWINGS"
  | "TEMPLATES"
  | "CONFLUENCE";

export type TechnicalDrawingType =
  | "horizontal"
  | "trend"
  | "horizontal-ray"
  | "vertical"
  | "rectangle"
  | "fib-retracement"
  | "fib-extension"
  | "text"
  | "anchored-vwap";

export type TechnicalDrawingTool = "cursor" | TechnicalDrawingType;

export interface TechnicalDrawingPoint {
  timestamp: string;
  price: number;
}

export interface TechnicalDrawing {
  id: string;
  type: TechnicalDrawingType;
  points: TechnicalDrawingPoint[];
  text?: string;
  visible: boolean;
  createdAt: string;
}

export type TechnicalLayout = "single" | "two-vertical" | "two-horizontal" | "four-grid";

export interface TechnicalPanelState {
  id: string;
  symbol: string;
  timeframe: TechnicalTimeframe;
  chartType: TechnicalChartType;
  indicators: TechnicalIndicatorConfig[];
  comparisons: string[];
}

export interface TechnicalLinkState {
  crosshair: boolean;
  symbol: boolean;
  timeframe: boolean;
}

export interface TechnicalFeatureState {
  autoSupportResistance: boolean;
  volumeProfile: boolean;
  confluence: boolean;
}

export interface TechnicalWorkspaceV2 {
  version: 2;
  layout: TechnicalLayout;
  activePanelId: string;
  panels: TechnicalPanelState[];
  links: TechnicalLinkState;
  features: TechnicalFeatureState;
  drawings: Record<string, TechnicalDrawing[]>;
  customTemplates: TechnicalTemplate[];
}

export interface TechnicalTemplate {
  id: string;
  name: string;
  builtIn: boolean;
  layout: TechnicalLayout;
  panels: Array<Pick<TechnicalPanelState, "timeframe" | "chartType" | "indicators">>;
  links: TechnicalLinkState;
  features: TechnicalFeatureState;
}

export interface HeikinAshiPoint extends MarketChartPoint {
  derived: true;
}

export interface FibonacciLevel {
  ratio: number;
  price: number;
}

export type TechnicalLevelStatus = "ACTIVE" | "TESTING" | "BROKEN" | "FLIPPED" | "STALE";

export interface TechnicalLevel {
  id: string;
  type: "SUPPORT" | "RESISTANCE";
  priceLow: number;
  priceHigh: number;
  centerPrice: number;
  score: number;
  touches: number;
  firstTouch: string;
  lastTouch: string;
  status: TechnicalLevelStatus;
  distancePct: number;
  confidence: "LOW" | "MEDIUM" | "HIGH";
  modelVersion: "technical-levels-v1.0.0";
}

export interface VolumeProfileBin {
  priceLow: number;
  priceHigh: number;
  centerPrice: number;
  volume: number;
  valueArea: boolean;
}

export interface VolumeProfileResult {
  status: "AVAILABLE" | "UNAVAILABLE";
  reason: string | null;
  bins: VolumeProfileBin[];
  poc: number | null;
  vah: number | null;
  val: number | null;
  totalVolume: number;
  valueAreaPercent: number;
  methodology: "UNIFORM_BAR_RANGE_ALLOCATION";
  modelVersion: "volume-profile-v1.0.0";
}

export interface TechnicalConfluence {
  status: "COMPLETE" | "PARTIAL";
  alignment: "HIGH" | "MEDIUM" | "LOW";
  trend: "BULLISH" | "NEUTRAL" | "BEARISH" | "UNAVAILABLE";
  momentum: "POSITIVE" | "NEUTRAL" | "NEGATIVE" | "UNAVAILABLE";
  volatility: "LOW" | "NORMAL" | "HIGH" | "UNAVAILABLE";
  structure: string;
  volume: string;
  reasons: string[];
  modelVersion: "technical-confluence-v1.0.0";
}
