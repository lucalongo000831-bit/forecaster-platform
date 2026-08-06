import type { FundamentalAnalysis } from "@/engines/fundamental";
import type { MarketRegimeAnalysis } from "@/engines/regime";
import type { TechnicalAnalysis } from "@/engines/technical";
import type { DcfAnalysis } from "@/engines/dcf";
import type { AnalystConsensus } from "@/providers";

export const TARGET_MODEL_VERSION = "target-composite-v1.0.0";
export type TargetHorizon = "3m" | "6m" | "12m" | "long";

export interface AnalystTargetDetail {
  value: number | null;
  minimum: number | null;
  mean: number | null;
  median: number | null;
  maximum: number | null;
  analystCount: number | null;
  dispersion: number | null;
  updatedAt: string | null;
  upsideDownside: number | null;
  provider: string | null;
}

export interface ScenarioTargetDetail {
  value: number | null;
  bear: number | null;
  base: number | null;
  bull: number | null;
  methods: string[];
  confidence: number;
}

export interface TargetAnalysis {
  symbol: string;
  horizon: TargetHorizon;
  currentPrice: number;
  currency: string;
  bearTarget: number | null;
  baseTarget: number | null;
  bullTarget: number | null;
  compositeTarget: number | null;
  analystTarget: AnalystTargetDetail;
  technicalTarget: ScenarioTargetDetail;
  fundamentalTarget: ScenarioTargetDetail;
  dcf: DcfAnalysis;
  upsideDownside: number | null;
  confidence: number;
  assumptions: string[];
  methodology: string[];
  modelVersion: typeof TARGET_MODEL_VERSION;
  calculatedAt: string;
  dataTimestamp: string;
}

export interface TargetEngineInput {
  symbol: string;
  horizon: TargetHorizon;
  currentPrice: number;
  currency: string;
  instrumentType: string;
  analyst: AnalystConsensus | null;
  analystProvider: string | null;
  technical: TechnicalAnalysis;
  fundamental: FundamentalAnalysis | null;
  regime: MarketRegimeAnalysis;
}
