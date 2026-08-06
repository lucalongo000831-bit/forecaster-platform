import type { TechnicalAnalysis } from "@/engines/technical";
import type { SignalHorizon } from "@/engines/signals";

export const RISK_MODEL_VERSION = "risk-plan-v1.0.0";
export type TradeSide = "LONG" | "SHORT";
export type RiskProfile = "CONSERVATIVE" | "MODERATE" | "AGGRESSIVE" | "CUSTOM";

export interface RiskPlanInput {
  symbol: string;
  side: TradeSide;
  entryPrice: number;
  horizon: SignalHorizon;
  riskProfile: RiskProfile;
  accountSize?: number | null;
  maximumRiskPercent?: number | null;
  customAtrMultiplier?: number | null;
  customStopPercent?: number | null;
  technical: TechnicalAnalysis;
}

export interface RiskPlan {
  symbol: string;
  side: TradeSide;
  entryPrice: number;
  horizon: SignalHorizon;
  riskProfile: RiskProfile;
  suggestedStop: number | null;
  structuralStop: number | null;
  atrStop: number | null;
  percentageStop: number;
  trailingStopDistance: number | null;
  chandelierExit: number | null;
  target1: number | null;
  target2: number | null;
  target3: number | null;
  riskPerShare: number | null;
  rewardPerShare: number | null;
  riskRewardRatio: number | null;
  positionSize: number | null;
  invalidationLevel: number | null;
  volatilityWarning: string | null;
  assumptions: string[];
  modelVersion: typeof RISK_MODEL_VERSION;
  calculatedAt: string;
  disclaimer: string;
}
