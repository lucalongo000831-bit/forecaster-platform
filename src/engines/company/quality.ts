import type { FundamentalAnalysis } from "@/engines/fundamental";
import { clamp, mean, sampleStandardDeviation } from "@/engines/shared/statistics";
import type { CompanyConfidence, CompanyQualityAnalysis, EarningsQualityAnalysis, HistoricalCompanyPeriod, ScoreDetail } from "@/types";

export const COMPANY_QUALITY_MODEL_VERSION = "company-quality-v1.0.0";

function detail(score: number | null, positives: string[], negatives: string[], missing: string[], confidence: CompanyConfidence): ScoreDetail {
  return { score: score === null ? null : clamp(score, 0, 100), positives, negatives, missing, confidence };
}
function labelConfidence(score: number | null, evidence: number): CompanyConfidence {
  if (score === null || evidence === 0) return "VERY_LOW";
  if (evidence >= 5) return "HIGH";
  if (evidence >= 3) return "MEDIUM";
  return "LOW";
}
function component(score: number | null, name: string, positiveThreshold = 65) {
  return detail(score, score !== null && score >= positiveThreshold ? [`${name} metrics are above the model threshold.`] : [], score !== null && score < 45 ? [`${name} metrics are below the model threshold.`] : [], score === null ? [`${name} data not available.`] : [], labelConfidence(score, score === null ? 0 : 3));
}

export function analyzeCompanyQuality(input: { fundamental: FundamentalAnalysis | null; earningsQuality: EarningsQualityAnalysis | null; periods: HistoricalCompanyPeriod[]; moatScore?: number | null; managementScore?: number | null }): CompanyQualityAnalysis {
  const fundamental = input.fundamental;
  const revenueGrowth = input.periods.flatMap((period, index) => {
    const previous = input.periods[index + 1];
    return period.revenue !== null && previous?.revenue && period.revenue > 0 && previous.revenue > 0 ? [period.revenue / previous.revenue - 1] : [];
  });
  const dispersion = sampleStandardDeviation(revenueGrowth);
  const predictabilityScore = revenueGrowth.length < 3 || dispersion === null ? null : clamp(90 - dispersion * 350, 0, 100);
  const capitalEfficiencyValues = [fundamental?.metrics.returnOnInvestedCapital, fundamental?.metrics.returnOnAssets].filter((value): value is number => value !== null && value !== undefined);
  const capitalEfficiencyScore = capitalEfficiencyValues.length ? mean(capitalEfficiencyValues.map((value) => clamp(35 + value * 220, 0, 100))) : null;
  const growth = component(fundamental?.growthScore ?? null, "Growth");
  const profitability = component(fundamental?.profitabilityScore ?? null, "Profitability");
  const capitalEfficiency = component(capitalEfficiencyScore, "Capital efficiency");
  if (fundamental?.metrics.returnOnEquity !== null && fundamental?.metrics.returnOnEquity !== undefined && fundamental.metrics.debtToEquity !== null && fundamental.metrics.debtToEquity > 2) capitalEfficiency.negatives.push("ROE may be amplified by financial leverage.");
  const balanceSheet = component(fundamental?.balanceSheetScore ?? null, "Balance sheet");
  const cashFlow = component(fundamental?.cashFlowScore ?? null, "Cash flow");
  const earningsQuality = component(input.earningsQuality?.score ?? null, "Earnings quality");
  earningsQuality.negatives.push(...(input.earningsQuality?.redFlags ?? []));
  const moat = component(input.moatScore ?? null, "Moat");
  const management = component(input.managementScore ?? null, "Management");
  const predictability = detail(predictabilityScore, predictabilityScore !== null && predictabilityScore >= 70 ? ["Historical revenue growth has been comparatively stable."] : [], predictabilityScore !== null && predictabilityScore < 45 ? ["Historical revenue growth has been volatile."] : [], predictabilityScore === null ? ["At least four comparable annual revenue observations are required."] : [], labelConfidence(predictabilityScore, revenueGrowth.length));
  const scores = [growth.score, profitability.score, capitalEfficiency.score, balanceSheet.score, cashFlow.score, earningsQuality.score, moat.score, management.score, predictability.score].filter((value): value is number => value !== null);
  const totalScore = mean(scores);
  const confidence: CompanyConfidence = scores.length === 9 && input.periods.length >= 5 ? "HIGH" : scores.length >= 6 ? "MEDIUM" : scores.length >= 3 ? "LOW" : "VERY_LOW";
  return { totalScore, growth, profitability, capitalEfficiency, balanceSheet, cashFlow, earningsQuality, moat, management, predictability, confidence, modelVersion: COMPANY_QUALITY_MODEL_VERSION };
}
