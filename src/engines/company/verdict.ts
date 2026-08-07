import { clamp } from "@/engines/shared/statistics";
import type { CompanyAssessment, CompanyConfidence, CompanyQualityAnalysis, CompanyRiskRegister, CompanyValuation, CompanyVerdict } from "@/types";

export const COMPANY_SCORE_VERSION = "company-score-v1.0.0";
export const COMPANY_REPORT_VERSION = "company-report-v1.0.0";

export const COMPANY_SCORE_WEIGHTS = { quality: 0.2, growth: 0.12, profitability: 0.1, cashAndEarnings: 0.12, balanceSheet: 0.08, moat: 0.1, management: 0.06, valuation: 0.12, risk: 0.05, momentumSentiment: 0.05 } as const;

export function scoreCompany(input: { quality: CompanyQualityAnalysis | null; valuation: CompanyValuation | null; risks: CompanyRiskRegister | null; momentum: number | null; sentiment: number | null }) {
  const valuationScore = input.valuation?.marginOfSafety === null || input.valuation?.marginOfSafety === undefined ? null : clamp(50 + input.valuation.marginOfSafety * 100, 0, 100);
  const momentumSentiment = input.momentum === null && input.sentiment === null ? null : ((input.momentum ?? 50) + (input.sentiment === null ? 50 : clamp(50 + input.sentiment * 50, 0, 100))) / 2;
  const values: Record<keyof typeof COMPANY_SCORE_WEIGHTS, number | null> = {
    quality: input.quality?.totalScore ?? null, growth: input.quality?.growth.score ?? null, profitability: input.quality?.profitability.score ?? null,
    cashAndEarnings: input.quality?.earningsQuality.score ?? input.quality?.cashFlow.score ?? null, balanceSheet: input.quality?.balanceSheet.score ?? null,
    moat: input.quality?.moat.score ?? null, management: input.quality?.management.score ?? null, valuation: valuationScore,
    risk: input.risks?.overallRiskScore === null || input.risks?.overallRiskScore === undefined ? null : 100 - input.risks.overallRiskScore, momentumSentiment,
  };
  const available = (Object.keys(values) as Array<keyof typeof values>).filter((key) => values[key] !== null);
  const activeWeight = available.reduce((sum, key) => sum + COMPANY_SCORE_WEIGHTS[key], 0);
  const score = activeWeight ? available.reduce((sum, key) => sum + (values[key] as number) * COMPANY_SCORE_WEIGHTS[key] / activeWeight, 0) : null;
  const completeness = activeWeight * 100;
  const confidence: CompanyConfidence = completeness >= 90 && input.quality?.confidence === "HIGH" ? "HIGH" : completeness >= 70 ? "MEDIUM" : completeness >= 45 ? "LOW" : "VERY_LOW";
  return { score, values, completeness, confidence };
}

export function decideCompany(input: { score: number | null; qualityScore: number | null; marginOfSafety: number | null; riskScore: number | null; shortEligible: boolean; dataCompleteness: number }): { verdict: CompanyVerdict; assessment: CompanyAssessment } {
  if (input.score === null || input.dataCompleteness < 40) return { verdict: "INSUFFICIENT_DATA", assessment: "INSUFFICIENT_DATA" };
  if (input.shortEligible) return { verdict: "SHORT", assessment: "SHORT_THESIS" };
  const quality = input.qualityScore ?? 50; const margin = input.marginOfSafety ?? -1; const risk = input.riskScore ?? 65;
  if (quality >= 78 && margin >= 0.3 && risk < 45 && input.score >= 80) return { verdict: "STRONG_BUY", assessment: "EXCEPTIONAL" };
  if (quality >= 68 && margin >= 0.15 && risk < 60 && input.score >= 68) return { verdict: "BUY", assessment: "VERY_INTERESTING" };
  if (quality >= 70 && margin < 0.05) return { verdict: "ACCUMULATE_ON_WEAKNESS", assessment: "INTERESTING" };
  if (quality < 40 && margin < 0) return { verdict: "AVOID", assessment: "AVOID" };
  if (risk >= 75 || input.score < 38) return { verdict: "REDUCE", assessment: "UNATTRACTIVE" };
  if (input.score >= 55) return { verdict: "HOLD", assessment: "NEUTRAL" };
  return { verdict: "WATCH", assessment: "UNATTRACTIVE" };
}
