import { clamp } from "@/engines/shared/statistics";
import type { CompanyConfidence, CompanyHorizon, CompanyValuation, TimeHorizonAssessment } from "@/types";

export const HORIZON_MODEL_VERSION = "company-horizons-v1.0.0";
const horizons: Array<{ horizon: CompanyHorizon; years: number; technicalWeight: number }> = [
  { horizon: "INTRADAY", years: 1 / 252, technicalWeight: 0.95 }, { horizon: "NEXT_SESSION", years: 1 / 252, technicalWeight: 0.95 }, { horizon: "1W", years: 5 / 252, technicalWeight: 0.9 }, { horizon: "1M", years: 1 / 12, technicalWeight: 0.8 }, { horizon: "3M", years: 0.25, technicalWeight: 0.65 }, { horizon: "6M", years: 0.5, technicalWeight: 0.5 }, { horizon: "1Y", years: 1, technicalWeight: 0.35 }, { horizon: "3Y", years: 3, technicalWeight: 0.15 }, { horizon: "5Y", years: 5, technicalWeight: 0.1 }, { horizon: "10Y", years: 10, technicalWeight: 0.05 }, { horizon: "15Y", years: 15, technicalWeight: 0.03 }, { horizon: "20Y", years: 20, technicalWeight: 0.02 },
];

function confidence(quality: number, valuation: CompanyValuation | null, years: number): CompanyConfidence {
  const base = valuation?.confidence === "HIGH" ? 4 : valuation?.confidence === "MEDIUM" ? 3 : valuation?.confidence === "LOW" ? 2 : 1;
  const adjusted = base - (years >= 15 ? 3 : years >= 10 ? 2 : years >= 5 ? 1 : 0) + (quality >= 75 ? 1 : 0);
  return adjusted >= 5 ? "VERY_HIGH" : adjusted >= 4 ? "HIGH" : adjusted >= 3 ? "MEDIUM" : adjusted >= 2 ? "LOW" : "VERY_LOW";
}

export function analyzeTimeHorizons(input: { currentPrice: number; qualityScore: number | null; technicalScore: number | null; riskScore: number | null; historicalGrowth: number | null; valuation: CompanyValuation | null; asOf: string }): TimeHorizonAssessment[] {
  const quality = input.qualityScore ?? 50; const technical = input.technicalScore ?? 50; const risk = input.riskScore ?? 50;
  const baseGrowth = clamp(input.historicalGrowth ?? 0.05, -0.05, 0.14);
  return horizons.map(({ horizon, years, technicalWeight }) => {
    const fundamentalScore = clamp(quality * 0.65 + (input.valuation?.marginOfSafety === null || input.valuation?.marginOfSafety === undefined ? 50 : clamp(50 + input.valuation.marginOfSafety * 100, 0, 100)) * 0.35, 0, 100);
    const score = clamp(technical * technicalWeight + fundamentalScore * (1 - technicalWeight) - Math.max(0, risk - 50) * 0.25, 0, 100);
    const orientation = score >= 60 ? "LONG" : score <= 38 ? "SHORT" : "NEUTRAL";
    const oneYearBase = input.valuation?.fairValue ?? input.currentPrice * (1 + baseGrowth);
    const base = years <= 1 ? input.currentPrice + (oneYearBase - input.currentPrice) * years : oneYearBase * (1 + baseGrowth) ** (years - 1);
    const uncertainty = clamp(0.04 + Math.sqrt(years) * 0.1 + (100 - quality) / 500, 0.05, 0.75);
    const bear = Math.max(0, base * (1 - uncertainty)); const bull = base * (1 + uncertainty);
    const longRange = years >= 10;
    return {
      horizon, orientation, score, confidence: confidence(quality, input.valuation, years), centralTarget: longRange ? null : base, bear, base, bull,
      impliedCagr: years >= 1 && base > 0 ? (base / input.currentPrice) ** (1 / years) - 1 : null,
      risk: longRange ? "Very high model uncertainty; structural disruption dominates point estimates." : risk >= 70 ? "High" : risk >= 45 ? "Moderate" : "Contained",
      catalysts: [], invalidation: input.valuation?.scenarios.find((scenario) => scenario.name === "BEAR")?.fairValuePerShare ? `Fundamental invalidation below the bear scenario (${input.valuation.scenarios.find((scenario) => scenario.name === "BEAR")?.fairValuePerShare?.toPrecision(4)}).` : null,
      positives: score >= 60 ? ["Composite evidence is constructive for this horizon."] : [], negatives: score <= 45 ? ["Risk-adjusted evidence is weak for this horizon."] : [], asOf: input.asOf,
    };
  });
}
