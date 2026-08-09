import type { GlobalRiskComponentKey, GlobalRiskStatus } from "./types";

export const GLOBAL_STRESS_MODEL_VERSION = "global-stress-v1";

export const GLOBAL_RISK_THRESHOLDS: ReadonlyArray<{ status: GlobalRiskStatus; min: number; max: number; meaning: string }> = [
  { status: "GREEN", min: 0, max: 24, meaning: "Normal market conditions" },
  { status: "YELLOW", min: 25, max: 49, meaning: "Elevated risk" },
  { status: "ORANGE", min: 50, max: 74, meaning: "High stress" },
  { status: "RED", min: 75, max: 100, meaning: "Systemic stress" },
];

export const GLOBAL_RISK_WEIGHTS: Record<GlobalRiskComponentKey, number> = {
  VOLATILITY: 0.15,
  CREDIT: 0.15,
  LIQUIDITY: 0.15,
  RATES: 0.10,
  MARKET_BREADTH: 0.10,
  EQUITY_STRESS: 0.10,
  CROSS_ASSET: 0.10,
  MACRO: 0.08,
  GEOPOLITICS: 0.07,
};

export const GLOBAL_RISK_CONFIG = {
  cacheSeconds: 300,
  snapshotOpenMarketMinutes: 15,
  snapshotClosedMarketMinutes: 120,
  componentCriticalScore: 70,
  componentElevatedScore: 55,
  systemic: {
    watchMinimumElevated: 2,
    elevatedMinimumCritical: 3,
    activeMinimumCritical: 4,
    requiredTransmissionComponents: ["CREDIT", "LIQUIDITY"] as GlobalRiskComponentKey[],
  },
  volatility: { vixNormal: 18, vixElevated: 25, vixExtreme: 45 },
  triggers: {
    vixOrange: 30,
    creditOrange: 65,
    liquidityOrange: 65,
    equityDrawdownOrange: -15,
    crossAssetCorrelationOrange: 0.7,
    breadthOrange: 65,
    normalizeComponent: 30,
  },
} as const;

export const RISK_STATUS_COLORS: Record<GlobalRiskStatus, string> = {
  GREEN: "var(--risk-green)",
  YELLOW: "var(--risk-yellow)",
  ORANGE: "var(--risk-orange)",
  RED: "var(--risk-red)",
};
