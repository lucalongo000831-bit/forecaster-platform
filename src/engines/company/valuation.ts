import type { FundamentalAnalysis } from "@/engines/fundamental";
import { clamp, mean } from "@/engines/shared/statistics";
import type { AnalystConsensus } from "@/providers";
import type { CompanyConfidence, CompanyValuation, HistoricalCompanyPeriod, ReverseDcfAnalysis, SourcedMetric, ValuationScenario } from "@/types";

export const REVERSE_DCF_MODEL_VERSION = "reverse-dcf-v1.0.0";
export const COMPANY_VALUATION_MODEL_VERSION = "company-valuation-v1.0.0";

function enterpriseValueFromGrowth(fcf: number, growth: number, years: number, discountRate: number, terminalGrowth: number) {
  let projected = fcf; let present = 0;
  for (let year = 1; year <= years; year += 1) { projected *= 1 + growth; present += projected / (1 + discountRate) ** year; }
  const terminal = projected * (1 + terminalGrowth) / (discountRate - terminalGrowth);
  return present + terminal / (1 + discountRate) ** years;
}

export function calculateReverseDcf(input: { currentPrice: number; shares: number | null; netDebt: number | null; freeCashFlow: number | null; historicalFcfGrowth: number | null; years?: number; discountRate?: number; terminalGrowth?: number }): ReverseDcfAnalysis {
  const years = input.years ?? 5; const discountRate = input.discountRate ?? 0.1; const terminalGrowth = input.terminalGrowth ?? 0.02;
  const warnings: string[] = [];
  if (!Number.isFinite(input.currentPrice) || input.currentPrice <= 0 || input.shares === null || input.shares <= 0 || input.freeCashFlow === null || input.freeCashFlow <= 0 || discountRate <= terminalGrowth) {
    return { applicable: false, impliedFcfGrowth: null, explicitYears: years, discountRate, terminalGrowth, classification: "UNAVAILABLE", explanation: "Reverse DCF unavailable because price, positive FCF, diluted shares or valid discount assumptions are missing.", confidence: "VERY_LOW", warnings: ["The engine does not substitute missing valuation inputs."], modelVersion: REVERSE_DCF_MODEL_VERSION };
  }
  const targetEnterpriseValue = input.currentPrice * input.shares + (input.netDebt ?? 0);
  let low = -0.5; let high = 0.6;
  const objective = (growth: number) => enterpriseValueFromGrowth(input.freeCashFlow as number, growth, years, discountRate, terminalGrowth) - targetEnterpriseValue;
  if (objective(low) * objective(high) > 0) return { applicable: false, impliedFcfGrowth: null, explicitYears: years, discountRate, terminalGrowth, classification: "UNAVAILABLE", explanation: "The current price could not be reconciled inside the bounded growth range.", confidence: "LOW", warnings: ["No extrapolation beyond -50% to +60% annual FCF growth was permitted."], modelVersion: REVERSE_DCF_MODEL_VERSION };
  for (let iteration = 0; iteration < 100; iteration += 1) {
    const midpoint = (low + high) / 2;
    if (Math.abs(objective(midpoint)) < Math.max(1, targetEnterpriseValue * 1e-8)) { low = midpoint; high = midpoint; break; }
    if (objective(low) * objective(midpoint) <= 0) high = midpoint; else low = midpoint;
  }
  const impliedFcfGrowth = (low + high) / 2;
  const relative = input.historicalFcfGrowth === null ? impliedFcfGrowth : impliedFcfGrowth - input.historicalFcfGrowth;
  const classification = impliedFcfGrowth < 0 ? "PRUDENT" : relative <= 0.02 && impliedFcfGrowth <= 0.12 ? "REASONABLE" : impliedFcfGrowth <= 0.18 ? "DEMANDING" : impliedFcfGrowth <= 0.3 ? "VERY_AGGRESSIVE" : "UNSUSTAINABLE";
  if (input.netDebt === null) warnings.push("Net debt was unavailable and treated as zero only for the reverse-equation bridge; confidence is reduced.");
  const confidence: CompanyConfidence = input.netDebt === null || input.historicalFcfGrowth === null ? "MEDIUM" : "HIGH";
  return { applicable: true, impliedFcfGrowth, explicitYears: years, discountRate, terminalGrowth, classification, explanation: `The current price appears to embed average free-cash-flow growth of approximately ${(impliedFcfGrowth * 100).toFixed(1)}% for ${years} years, holding the other assumptions constant.`, confidence, warnings, modelVersion: REVERSE_DCF_MODEL_VERSION };
}

function metric(key: string, label: string, value: number | null, provider: string, kind: SourcedMetric["kind"] = "CALCULATED", formula: string | null = null): SourcedMetric {
  return { key, label, value, unit: value === null ? null : key.includes("yield") ? "%" : "x", currency: null, period: "TTM", kind, provider: value === null ? null : provider, formula, status: value === null ? "DATA_NOT_AVAILABLE" : "AVAILABLE" };
}

export function buildValuationMultiples(fundamental: FundamentalAnalysis | null): SourcedMetric[] {
  const m = fundamental?.metrics;
  const provider = fundamental?.source ?? "unavailable";
  return [
    metric("trailingPe", "Trailing P/E", m?.trailingPe ?? null, provider, "FACT"),
    metric("forwardPe", "Forward P/E", m?.forwardPe ?? null, provider, "ANALYST_CONSENSUS"),
    metric("evToEbitda", "EV / EBITDA", m?.evToEbitda ?? null, provider),
    metric("evToRevenue", "EV / Revenue", m?.evToRevenue ?? null, provider),
    metric("priceToSales", "Price / Sales", m?.priceToSales ?? null, provider),
    metric("priceToBook", "Price / Book", m?.priceToBook ?? null, provider),
    metric("priceToFreeCashFlow", "Price / FCF", m?.priceToFreeCashFlow ?? null, provider),
    metric("freeCashFlowYield", "FCF yield", m?.freeCashFlowYield === null || m?.freeCashFlowYield === undefined ? null : m.freeCashFlowYield * 100, provider, "CALCULATED", "FCF / market capitalization"),
    metric("earningsYield", "Earnings yield", m?.earningsYield === null || m?.earningsYield === undefined ? null : m.earningsYield * 100, provider, "CALCULATED", "1 / trailing P/E"),
    metric("dividendYield", "Dividend yield", m?.dividendYield === null || m?.dividendYield === undefined ? null : m.dividendYield * 100, provider, "FACT"),
    metric("peg", "PEG", m?.peg ?? null, provider),
  ].map((item) => ({ ...item, value: typeof item.value === "number" ? clamp(item.value, -1e9, 1e9) : item.value }));
}

export function runCompanyDcfScenario(input: { name: ValuationScenario["name"]; fcf: number; shares: number; netDebt: number; currentPrice: number; growth: number; discountRate: number; terminalGrowth: number; margin: number | null }): ValuationScenario {
  if (input.discountRate <= input.terminalGrowth || input.growth < -0.5 || input.growth > 0.5) return { name: input.name, revenueGrowth: input.growth, operatingMargin: input.margin, discountRate: input.discountRate, terminalGrowth: input.terminalGrowth, enterpriseValue: null, equityValue: null, fairValuePerShare: null, upsideDownside: null, assumptions: ["Scenario rejected because growth or discount assumptions were inconsistent."] };
  const enterpriseValue = enterpriseValueFromGrowth(input.fcf, input.growth, 5, input.discountRate, input.terminalGrowth);
  const equityValue = enterpriseValue - input.netDebt;
  const fairValuePerShare = Math.max(0, equityValue / input.shares);
  return { name: input.name, revenueGrowth: input.growth, operatingMargin: input.margin, discountRate: input.discountRate, terminalGrowth: input.terminalGrowth, enterpriseValue, equityValue, fairValuePerShare, upsideDownside: input.currentPrice > 0 ? fairValuePerShare / input.currentPrice - 1 : null, assumptions: ["Five-year explicit FCF period.", "FCF growth is bounded and fades into a perpetual terminal rate.", "Net debt is subtracted before diluted per-share value."] };
}

function range(value: number | null, low: number, high: number): [number, number] | null {
  if (value === null || !Number.isFinite(value) || value <= 0) return null;
  const round = (candidate: number) => Number(candidate.toPrecision(3));
  return [round(value * low), round(value * high)];
}

export function buildCompanyValuation(input: { currentPrice: number; fundamental: FundamentalAnalysis | null; historical: HistoricalCompanyPeriod[]; analyst: AnalystConsensus | null; technicalTarget?: number | null; qualityScore?: number | null }): CompanyValuation | null {
  const summary = input.fundamental?.inputs.summary;
  const latest = input.historical[0];
  const fcf = latest?.freeCashFlow ?? input.fundamental?.metrics.freeCashFlow ?? summary?.freeCashflow ?? null;
  const shares = latest?.dilutedShares ?? summary?.sharesOutstanding ?? null;
  if (input.currentPrice <= 0) return null;
  const netDebt = latest?.netDebt ?? input.fundamental?.metrics.netDebt ?? 0;
  const historicalGrowth = input.fundamental?.metrics.freeCashFlowGrowthYoY ?? input.fundamental?.metrics.revenueCagr5Y ?? 0.04;
  const boundedGrowth = clamp(historicalGrowth ?? 0.04, -0.05, 0.14);
  const scenarios = fcf !== null && fcf > 0 && shares !== null && shares > 0 ? [
    runCompanyDcfScenario({ name: "BEAR", fcf, shares, netDebt, currentPrice: input.currentPrice, growth: clamp(boundedGrowth - 0.05, -0.08, 0.04), discountRate: 0.12, terminalGrowth: 0.01, margin: input.fundamental?.metrics.operatingMargin ?? null }),
    runCompanyDcfScenario({ name: "BASE", fcf, shares, netDebt, currentPrice: input.currentPrice, growth: boundedGrowth, discountRate: 0.1, terminalGrowth: 0.0225, margin: input.fundamental?.metrics.operatingMargin ?? null }),
    runCompanyDcfScenario({ name: "BULL", fcf, shares, netDebt, currentPrice: input.currentPrice, growth: clamp(boundedGrowth + 0.04, 0, 0.18), discountRate: 0.085, terminalGrowth: 0.03, margin: input.fundamental?.metrics.operatingMargin ?? null }),
  ] : [];
  const reverseDcf = calculateReverseDcf({ currentPrice: input.currentPrice, shares, netDebt, freeCashFlow: fcf, historicalFcfGrowth: historicalGrowth });
  const dcfBase = scenarios.find((scenario) => scenario.name === "BASE")?.fairValuePerShare ?? null;
  const normalizedPe = summary?.trailingEps && summary.trailingEps > 0 ? summary.trailingEps * clamp(mean([summary.trailingPe, summary.forwardPe].filter((value): value is number => value !== null)) ?? 15, 8, 30) : null;
  const analystValue = input.analyst?.targetConsensus ?? input.analyst?.targetMedian ?? null;
  const weighted = [{ value: dcfBase, weight: 0.5 }, { value: normalizedPe, weight: 0.25 }, { value: analystValue, weight: 0.15 }, { value: input.technicalTarget ?? null, weight: 0.1 }].filter((item): item is { value: number; weight: number } => item.value !== null && item.value > 0);
  const weight = weighted.reduce((sum, item) => sum + item.weight, 0);
  const fairValue = weight ? weighted.reduce((sum, item) => sum + item.value * item.weight, 0) / weight : null;
  const qualityAdjustment = input.qualityScore === null || input.qualityScore === undefined ? 0.85 : clamp(0.75 + input.qualityScore / 400, 0.75, 1);
  const prudentFairValue = fairValue === null ? null : fairValue * qualityAdjustment;
  const marginOfSafety = prudentFairValue === null || prudentFairValue <= 0 ? null : (prudentFairValue - input.currentPrice) / prudentFairValue;
  const sensitivity = fcf !== null && fcf > 0 && shares !== null && shares > 0 ? [0.085, 0.1, 0.115].flatMap((discountRate) => [0.01, 0.02, 0.03].map((terminalGrowth) => ({ discountRate, terminalGrowth, fairValue: runCompanyDcfScenario({ name: "BASE", fcf, shares, netDebt, currentPrice: input.currentPrice, growth: boundedGrowth, discountRate, terminalGrowth, margin: input.fundamental?.metrics.operatingMargin ?? null }).fairValuePerShare }))) : [];
  const confidence: CompanyConfidence = weighted.length >= 3 && input.historical.length >= 5 ? "HIGH" : weighted.length >= 2 ? "MEDIUM" : weighted.length ? "LOW" : "VERY_LOW";
  return {
    multiples: buildValuationMultiples(input.fundamental), historicalPercentiles: {}, peerPercentiles: {}, reverseDcf, scenarios, fairValue, prudentFairValue, marginOfSafety,
    operationalPrices: { veryInteresting: range(prudentFairValue, 0.55, 0.68), interesting: range(prudentFairValue, 0.68, 0.8), accumulation: range(prudentFairValue, 0.8, 0.9), fairValue: range(fairValue, 0.95, 1.05), fullyValued: range(fairValue, 1.05, 1.2), avoid: range(fairValue, 1.2, 1.4), euphoria: range(fairValue, 1.4, 1.8) },
    sensitivity, confidence, modelVersion: COMPANY_VALUATION_MODEL_VERSION,
  };
}
