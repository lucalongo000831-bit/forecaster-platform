import type { FundamentalAnalysis } from "@/engines/fundamental";
import type { TechnicalAnalysis } from "@/engines/technical";
import { clamp, mean } from "@/engines/shared/statistics";
import type { CompanyCatalyst, CompanyConfidence, CompanyQualityAnalysis, CompanyRedFlag, CompanyRiskItem, CompanyRiskRegister, CompanyValuation, EarningsQualityAnalysis, HistoricalCompanyPeriod } from "@/types";

export const COMPANY_RISK_MODEL_VERSION = "company-risk-register-v1.0.0";

function level(value: number): "LOW" | "MEDIUM" | "HIGH" { return value >= 70 ? "HIGH" : value >= 40 ? "MEDIUM" : "LOW"; }
function confidence(points: number): CompanyConfidence { return points >= 7 ? "HIGH" : points >= 4 ? "MEDIUM" : points ? "LOW" : "VERY_LOW"; }
function item(category: string, description: string, probability: number, impact: number, indicators: string[], sources: string[]): CompanyRiskItem {
  return { id: `${category.toLowerCase().replace(/\W+/g, "-")}-${indicators.length}`, category, description, probability: level(probability), impact: level(impact), horizon: "12–36 months", trend: "UNKNOWN", mitigations: [], indicators, sources, confidence: confidence(indicators.length) };
}

export function buildCompanyRiskRegister(input: { fundamental: FundamentalAnalysis | null; earnings: EarningsQualityAnalysis | null; quality: CompanyQualityAnalysis | null; valuation: CompanyValuation | null; technical: TechnicalAnalysis | null; periods: HistoricalCompanyPeriod[]; knownCatalysts?: CompanyCatalyst[] }): CompanyRiskRegister {
  const metrics = input.fundamental?.metrics; const latest = input.periods[0]; const previous = input.periods[1];
  const debtRisk = metrics?.netDebtToEbitda === null || metrics?.netDebtToEbitda === undefined ? null : clamp(metrics.netDebtToEbitda * 22, 0, 100);
  const valuationRisk = input.valuation?.marginOfSafety === null || input.valuation?.marginOfSafety === undefined ? null : clamp(55 - input.valuation.marginOfSafety * 100, 0, 100);
  const businessRisk = input.quality?.totalScore === null || input.quality?.totalScore === undefined ? null : 100 - input.quality.totalScore;
  const eventRisk = input.technical?.volatility.maximumDrawdown === null || input.technical?.volatility.maximumDrawdown === undefined ? null : clamp(Math.abs(input.technical.volatility.maximumDrawdown) * 120, 0, 100);
  const earningsRisk = input.earnings?.score === null || input.earnings?.score === undefined ? null : 100 - input.earnings.score;
  const items: CompanyRiskItem[] = [];
  if (debtRisk !== null && debtRisk >= 35) items.push(item("Financial", "Leverage may constrain capital allocation or amplify cyclical downside.", debtRisk, debtRisk, [metrics?.netDebtToEbitda === null ? "" : `Net debt / EBITDA ${metrics?.netDebtToEbitda?.toFixed(2)}x`].filter(Boolean), [input.fundamental?.source ?? "configured provider"]));
  if (valuationRisk !== null && valuationRisk >= 45) items.push(item("Valuation", "The current price leaves limited margin for execution misses or multiple compression.", valuationRisk, 70, [`Margin of safety ${((input.valuation?.marginOfSafety ?? 0) * 100).toFixed(1)}%`], ["company valuation model"]));
  if (eventRisk !== null && eventRisk >= 35) items.push(item("Market liquidity", "Historical drawdown and volatility indicate material mark-to-market risk.", 55, eventRisk, [`Maximum drawdown ${((input.technical?.volatility.maximumDrawdown ?? 0) * 100).toFixed(1)}%`], ["market price history"]));
  const redFlags: CompanyRedFlag[] = [];
  for (const warning of input.earnings?.redFlags ?? []) redFlags.push({ code: `EARNINGS_${redFlags.length + 1}`, severity: "HIGH", evidence: warning, period: latest?.fiscalDate ?? null, value: null, source: latest?.provider ?? null, alternativeExplanation: "Timing, working-capital seasonality or a disclosed one-off may explain part of the divergence." });
  if (metrics?.revenueGrowthYoY !== null && metrics?.revenueGrowthYoY !== undefined && metrics.revenueGrowthYoY < 0) redFlags.push({ code: "REVENUE_CONTRACTION", severity: "HIGH", evidence: "Reported revenue contracted year over year.", period: latest?.fiscalDate ?? null, value: metrics.revenueGrowthYoY, source: input.fundamental?.source ?? null, alternativeExplanation: "Currency, divestitures or cyclical normalization may contribute." });
  const debtGrowth = latest?.totalDebt !== null && latest?.totalDebt !== undefined && previous?.totalDebt ? latest.totalDebt / previous.totalDebt - 1 : null;
  if (debtGrowth !== null && debtGrowth > 0.2) redFlags.push({ code: "DEBT_GROWTH", severity: "MEDIUM", evidence: "Total debt increased by more than 20% year over year.", period: latest?.fiscalDate ?? null, value: debtGrowth, source: latest?.provider ?? null, alternativeExplanation: "Debt may finance a productive acquisition or temporary working capital." });
  const catalysts = [...(input.knownCatalysts ?? [])];
  if (metrics?.freeCashFlowGrowthYoY !== null && metrics?.freeCashFlowGrowthYoY !== undefined && metrics.freeCashFlowGrowthYoY > 0.1) catalysts.push({ title: "Free-cash-flow improvement", direction: "POSITIVE", probability: "MEDIUM", impact: "MEDIUM", horizon: "12 months", expectedDate: null, source: input.fundamental?.source ?? null, status: "MONITOR" });
  if (metrics?.freeCashFlowGrowthYoY !== null && metrics?.freeCashFlowGrowthYoY !== undefined && metrics.freeCashFlowGrowthYoY < -0.1) catalysts.push({ title: "Free-cash-flow deterioration", direction: "NEGATIVE", probability: "MEDIUM", impact: "HIGH", horizon: "12 months", expectedDate: null, source: input.fundamental?.source ?? null, status: "MONITOR" });
  const deterioration = [metrics?.revenueGrowthYoY, metrics?.freeCashFlowGrowthYoY, metrics?.epsGrowthYoY].filter((value): value is number => value !== null && value !== undefined).filter((value) => value < 0).length;
  const negativeMomentum = (input.technical?.score ?? 50) < 40;
  const aggressiveExpectations = ["VERY_AGGRESSIVE", "UNSUSTAINABLE"].includes(input.valuation?.reverseDcf.classification ?? "");
  const shortThesisScore = clamp((valuationRisk ?? 50) * 0.25 + deterioration * 15 + (negativeMomentum ? 25 : 0) + (aggressiveExpectations ? 20 : 0), 0, 100);
  const squeezeRisk = clamp((input.technical?.momentum.rsi14.value ?? 50) > 65 ? 75 : (input.technical?.volatility.realized20 ?? 0) * 120, 0, 100);
  const shortEligible = shortThesisScore >= 70 && deterioration >= 1 && negativeMomentum && aggressiveExpectations;
  const values = [debtRisk, valuationRisk, businessRisk, eventRisk, earningsRisk].filter((value): value is number => value !== null);
  const overallRiskScore = mean(values);
  return { overallRiskScore, permanentCapitalLossRisk: mean([debtRisk, businessRisk, earningsRisk].filter((value): value is number => value !== null)), valuationRisk, businessRisk, balanceSheetRisk: debtRisk, eventRisk, shortThesisScore, squeezeRisk, shortEligible, items, redFlags, catalysts, confidence: confidence(values.length), modelVersion: COMPANY_RISK_MODEL_VERSION };
}
