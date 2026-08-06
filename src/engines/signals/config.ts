import type { SignalComponentKey, SignalHorizon } from "./types";

export const SIGNAL_CATEGORY_THRESHOLDS = {
  STRONG_SELL: [0, 20],
  SELL: [20, 40],
  HOLD: [40, 60],
  BUY: [60, 80],
  STRONG_BUY: [80, 100.0001],
} as const;

export const SIGNAL_MINIMUM_COMPLETENESS = 45;

export const SIGNAL_WEIGHTS: Record<SignalHorizon, Record<SignalComponentKey, number>> = {
  intraday: { trend: 0.14, momentum: 0.24, volatility: 0.10, volume: 0.20, structure: 0.18, relative: 0.04, fundamental: 0, seasonality: 0, regime: 0.10 },
  "1d": { trend: 0.17, momentum: 0.21, volatility: 0.10, volume: 0.16, structure: 0.18, relative: 0.06, fundamental: 0, seasonality: 0.02, regime: 0.10 },
  "1w": { trend: 0.20, momentum: 0.18, volatility: 0.09, volume: 0.12, structure: 0.17, relative: 0.08, fundamental: 0.03, seasonality: 0.04, regime: 0.09 },
  "1m": { trend: 0.21, momentum: 0.15, volatility: 0.08, volume: 0.08, structure: 0.14, relative: 0.10, fundamental: 0.08, seasonality: 0.07, regime: 0.09 },
  "3m": { trend: 0.20, momentum: 0.12, volatility: 0.08, volume: 0.06, structure: 0.12, relative: 0.12, fundamental: 0.12, seasonality: 0.08, regime: 0.10 },
  "6m": { trend: 0.18, momentum: 0.09, volatility: 0.08, volume: 0.05, structure: 0.11, relative: 0.13, fundamental: 0.16, seasonality: 0.09, regime: 0.11 },
  "12m": { trend: 0.15, momentum: 0.07, volatility: 0.08, volume: 0.04, structure: 0.10, relative: 0.13, fundamental: 0.21, seasonality: 0.10, regime: 0.12 },
  long: { trend: 0.12, momentum: 0.04, volatility: 0.08, volume: 0.03, structure: 0.09, relative: 0.12, fundamental: 0.28, seasonality: 0.11, regime: 0.13 },
};
