import { clamp, mean } from "@/engines/shared/statistics";
import type { CompanyConfidence, EarningsQualityAnalysis, HistoricalCompanyPeriod } from "@/types";

export const EARNINGS_QUALITY_MODEL_VERSION = "earnings-quality-v1.0.0";

function ratio(a: number | null, b: number | null) { return a === null || b === null || b === 0 ? null : a / b; }
function scoreAverage(values: Array<number | null>) { return mean(values.filter((value): value is number => value !== null)); }
function confidence(available: number, periods: number): CompanyConfidence {
  if (available >= 7 && periods >= 5) return "HIGH";
  if (available >= 5 && periods >= 3) return "MEDIUM";
  if (available >= 2) return "LOW";
  return "VERY_LOW";
}

export function analyzeEarningsQuality(periods: HistoricalCompanyPeriod[], marketCap: number | null): EarningsQualityAnalysis {
  const latest = periods[0]; const previous = periods[1];
  if (!latest) return { score: null, cashConversionScore: null, accrualRiskScore: null, dilutionRiskScore: null, normalizationRiskScore: null, cashConversion: null, fcfToNetIncome: null, fcfMargin: null, fcfYield: null, fcfPerShare: null, ebitdaToFcfConversion: null, classification: "NOT_ASSESSABLE", redFlags: [], assumptions: ["No verified historical statements were available."], confidence: "VERY_LOW", modelVersion: EARNINGS_QUALITY_MODEL_VERSION };
  const cashConversion = ratio(latest.operatingCashFlow, latest.netIncome);
  const fcfToNetIncome = ratio(latest.freeCashFlow, latest.netIncome);
  const fcfMargin = ratio(latest.freeCashFlow, latest.revenue);
  const fcfYield = ratio(latest.freeCashFlow, marketCap);
  const fcfPerShare = ratio(latest.freeCashFlow, latest.dilutedShares);
  const ebitdaToFcfConversion = ratio(latest.freeCashFlow, latest.ebitda);
  const cashConversionScore = scoreAverage([
    cashConversion === null ? null : clamp(35 + cashConversion * 45, 0, 100),
    fcfToNetIncome === null ? null : clamp(35 + fcfToNetIncome * 45, 0, 100),
    fcfMargin === null ? null : clamp(35 + fcfMargin * 180, 0, 100),
  ]);
  const accrualRiskScore = cashConversion === null ? null : clamp(100 - cashConversion * 65, 0, 100);
  const dilution = latest.dilutedShares !== null && previous?.dilutedShares ? latest.dilutedShares / previous.dilutedShares - 1 : null;
  const dilutionRiskScore = dilution === null ? null : clamp(25 + Math.max(0, dilution) * 1_000 - Math.max(0, -dilution) * 300, 0, 100);
  const sbcToFcf = ratio(latest.stockBasedCompensation, latest.freeCashFlow === null ? null : Math.abs(latest.freeCashFlow));
  const normalizationRiskScore = sbcToFcf === null ? null : clamp(15 + Math.max(0, sbcToFcf) * 120, 0, 100);
  const riskAdjusted = scoreAverage([cashConversionScore, accrualRiskScore === null ? null : 100 - accrualRiskScore, dilutionRiskScore === null ? null : 100 - dilutionRiskScore, normalizationRiskScore === null ? null : 100 - normalizationRiskScore]);
  const redFlags: string[] = [];
  if (latest.netIncome !== null && previous?.netIncome !== null && latest.netIncome > previous.netIncome && latest.operatingCashFlow !== null && previous.operatingCashFlow !== null && latest.operatingCashFlow < previous.operatingCashFlow) redFlags.push("Net income increased while operating cash flow declined.");
  if (fcfToNetIncome !== null && fcfToNetIncome < 0.65) redFlags.push("Free cash flow is materially below reported net income.");
  if (sbcToFcf !== null && sbcToFcf > 0.3) redFlags.push("Stock-based compensation is high relative to free cash flow.");
  if (dilution !== null && dilution > 0.03) redFlags.push("Diluted share count increased by more than 3% year over year.");
  const negativeFcf = latest.freeCashFlow !== null && latest.freeCashFlow < 0;
  const classification = negativeFcf ? "NEGATIVE" : riskAdjusted === null ? "NOT_ASSESSABLE" : riskAdjusted >= 80 ? "EXCELLENT" : riskAdjusted >= 65 ? "GOOD" : riskAdjusted >= 50 ? "FAIR" : "WEAK";
  const available = [cashConversion, fcfToNetIncome, fcfMargin, fcfYield, fcfPerShare, ebitdaToFcfConversion, dilution, sbcToFcf].filter((value) => value !== null).length;
  return {
    score: riskAdjusted, cashConversionScore, accrualRiskScore, dilutionRiskScore, normalizationRiskScore,
    cashConversion, fcfToNetIncome, fcfMargin, fcfYield, fcfPerShare, ebitdaToFcfConversion, classification, redFlags,
    assumptions: ["FCF uses reported FCF or operating cash flow plus provider-signed capex.", "Maintenance and growth capex are not separated without a verified disclosure.", "Adjusted-versus-GAAP risk remains unavailable without structured adjusted earnings."],
    confidence: confidence(available, periods.length), modelVersion: EARNINGS_QUALITY_MODEL_VERSION,
  };
}
