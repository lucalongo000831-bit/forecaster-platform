import type { MarketChartPoint } from "@/types";

export const BACKTEST_MODEL_VERSION = "backtest-v1.0.0";
export type BacktestStrategy = "TREND_MOMENTUM" | "SMA_CROSS" | "BREAKOUT";
export type BacktestDirection = "LONG" | "SHORT" | "BOTH";

export interface BacktestConfiguration {
  symbol: string;
  benchmark: string;
  from: string;
  to: string;
  strategy: BacktestStrategy;
  direction: BacktestDirection;
  entryTiming: "NEXT_OPEN" | "NEXT_CLOSE";
  initialCapital: number;
  stopPercent: number;
  targetPercent: number;
  trailingPercent: number;
  maximumHoldingDays: number;
  commission: number;
  spreadBps: number;
  slippageBps: number;
  reinvest: boolean;
}

export interface BacktestTrade {
  side: "LONG" | "SHORT";
  entryAt: string;
  exitAt: string;
  entryPrice: number;
  exitPrice: number;
  quantity: number;
  costs: number;
  pnl: number;
  returnPercent: number;
  holdingDays: number;
  exitReason: "SIGNAL" | "STOP" | "TARGET" | "TRAILING" | "MAX_HOLD" | "END_OF_DATA";
}

export interface BacktestMetrics {
  totalReturn: number;
  cagr: number | null;
  annualizedVolatility: number | null;
  sharpeRatio: number | null;
  sortinoRatio: number | null;
  calmarRatio: number | null;
  maximumDrawdown: number;
  drawdownDuration: number;
  winRate: number | null;
  lossRate: number | null;
  averageWin: number | null;
  averageLoss: number | null;
  payoffRatio: number | null;
  profitFactor: number | null;
  expectancy: number | null;
  exposure: number;
  turnover: number;
  numberOfTrades: number;
  averageHoldingPeriod: number | null;
  bestTrade: number | null;
  worstTrade: number | null;
  benchmarkReturn: number | null;
  alpha: number | null;
  beta: number | null;
}

export interface BacktestResult {
  configuration: BacktestConfiguration;
  metrics: BacktestMetrics;
  trades: BacktestTrade[];
  equityCurve: Array<{ timestamp: string; value: number }>;
  drawdownCurve: Array<{ timestamp: string; value: number }>;
  benchmarkCurve: Array<{ timestamp: string; value: number }>;
  dataPoints: number;
  warmupPoints: number;
  modelVersion: typeof BACKTEST_MODEL_VERSION;
  createdAt: string;
  runtimeMs: number;
  persisted: boolean;
  biasControls: string[];
  limitations: string[];
}

export interface BacktestInput {
  configuration: BacktestConfiguration;
  bars: MarketChartPoint[];
  benchmarkBars?: MarketChartPoint[] | null;
}
