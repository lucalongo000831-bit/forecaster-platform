export const DCF_MODEL_VERSION = "dcf-v1.0.0";

export interface DcfScenario {
  name: "BEAR" | "BASE" | "BULL";
  explicitGrowth: number;
  terminalGrowth: number;
  discountRate: number;
  enterpriseValue: number;
  equityValue: number;
  fairValuePerShare: number;
}

export interface DcfSensitivityCell {
  discountRate: number;
  terminalGrowth: number;
  fairValuePerShare: number;
}

export interface DcfAnalysis {
  applicable: boolean;
  modelVersion: typeof DCF_MODEL_VERSION;
  calculatedAt: string;
  completeness: number;
  scenarios: DcfScenario[];
  sensitivity: DcfSensitivityCell[];
  assumptions: string[];
  warnings: string[];
}

export interface DcfInput {
  freeCashFlow: number | null;
  historicalGrowth: number | null;
  netDebt: number | null;
  sharesOutstanding: number | null;
  stockBasedCompensation: number | null;
  instrumentType: string;
  forecastYears?: number;
  marginOfSafety?: number;
}
