import type { FundamentalAnalysis } from "@/engines/fundamental";
import { clamp } from "@/engines/shared/statistics";
import type { CompanyConfidence, ReverseDcfAnalysis, SourcedMetric } from "@/types";

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
