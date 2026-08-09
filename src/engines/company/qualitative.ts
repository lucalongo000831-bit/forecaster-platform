import type { FundamentalAnalysis } from "@/engines/fundamental";
import { clamp, mean, percentile, sampleStandardDeviation } from "@/engines/shared/statistics";
import type { CompanyConfidence, HistoricalCompanyPeriod, ManagementAnalysis, MoatAnalysis, MoatCategoryAssessment, PeerComparison } from "@/types";

export const MOAT_MODEL_VERSION = "moat-v1.0.0";
export const MANAGEMENT_MODEL_VERSION = "management-capital-allocation-v1.0.0";
export const PEER_MODEL_VERSION = "peer-comparison-v1.0.0";

const moatCategories = ["network effect", "switching costs", "brand", "economies of scale", "cost advantage", "intellectual property", "proprietary data", "distribution", "regulation", "ecosystem", "supply chain", "platform effects", "technology leadership"];
function confidence(count: number): CompanyConfidence { return count >= 5 ? "HIGH" : count >= 3 ? "MEDIUM" : count ? "LOW" : "VERY_LOW"; }
function category(name: string, score: number | null, quantitativeEvidence: string[], threats: string[]): MoatCategoryAssessment {
  return { category: name, present: score === null ? null : score >= 60, strength: score === null ? "UNCERTAIN" : score >= 80 ? "STRONG" : score >= 60 ? "MODERATE" : score >= 40 ? "WEAK" : "NONE", durationYears: null, quantitativeEvidence, qualitativeEvidence: [], threats, confidence: confidence(quantitativeEvidence.length) };
}

export function analyzeMoat(fundamental: FundamentalAnalysis | null, periods: HistoricalCompanyPeriod[]): MoatAnalysis {
  const margin = fundamental?.metrics.operatingMargin ?? null;
  const roic = fundamental?.metrics.returnOnInvestedCapital ?? null;
  const revenue = periods.flatMap((row) => row.revenue === null ? [] : [row.revenue]);
  const revenueDispersion = revenue.length >= 3 ? sampleStandardDeviation(revenue.map((value, index) => index === revenue.length - 1 ? 0 : value / (revenue[index + 1] || value) - 1)) : null;
  const scaleScore = margin === null ? null : clamp(45 + margin * 140 + (revenueDispersion !== null && revenueDispersion < 0.12 ? 12 : 0), 0, 100);
  const costScore = margin === null || roic === null ? null : clamp(35 + margin * 110 + roic * 130, 0, 100);
  const categories = moatCategories.map((name) => {
    if (name === "economies of scale") return category(name, scaleScore, [margin === null ? "" : `Operating margin ${(margin * 100).toFixed(1)}%.`, revenueDispersion === null ? "" : `Growth dispersion ${(revenueDispersion * 100).toFixed(1)}%.`].filter(Boolean), ["Scale can reverse if fixed-cost absorption weakens."]);
    if (name === "cost advantage") return category(name, costScore, [margin === null ? "" : `Operating margin ${(margin * 100).toFixed(1)}%.`, roic === null ? "" : `ROIC ${(roic * 100).toFixed(1)}%.`].filter(Boolean), ["Margins and ROIC do not prove the source or durability of cost advantage."]);
    return category(name, null, [], ["No sufficiently structured evidence was available for this category."]);
  });
  const scored = categories.filter((item) => item.strength !== "UNCERTAIN");
  const scores = [scaleScore, costScore].filter((value): value is number => value !== null);
  const score = mean(scores);
  const classification = score === null || scored.length < 2 ? "UNCERTAIN" : score >= 78 ? "WIDE" : score >= 60 ? "NARROW" : score >= 40 ? "WEAK" : "NONE";
  return { classification, score, categories, confidence: confidence(scores.length), modelVersion: MOAT_MODEL_VERSION };
}

export function analyzeManagement(periods: HistoricalCompanyPeriod[], insiderSignal?: { score: number | null; netShares: number | null; purchases: number; sales: number }) : ManagementAnalysis {
  const latest = periods[0]; const previous = periods[1];
  if (!latest) return { executionScore: null, capitalAllocationScore: null, shareholderAlignmentScore: null, credibilityScore: null, overallScore: null, evidence: [], warnings: ["Historical capital-allocation data not available."], confidence: "VERY_LOW", modelVersion: MANAGEMENT_MODEL_VERSION };
  const evidence: string[] = []; const warnings: string[] = [];
  const revenueGrowth = latest.revenue !== null && previous?.revenue ? latest.revenue / previous.revenue - 1 : null;
  const fcfGrowth = latest.freeCashFlow !== null && previous?.freeCashFlow && previous.freeCashFlow > 0 ? latest.freeCashFlow / previous.freeCashFlow - 1 : null;
  const shareGrowth = latest.dilutedShares !== null && previous?.dilutedShares ? latest.dilutedShares / previous.dilutedShares - 1 : null;
  const debtGrowth = latest.totalDebt !== null && previous?.totalDebt && previous.totalDebt > 0 ? latest.totalDebt / previous.totalDebt - 1 : null;
  const executionScore = mean([revenueGrowth, fcfGrowth].filter((value): value is number => value !== null).map((value) => clamp(50 + value * 180, 0, 100)));
  const allocationInputs = [latest.freeCashFlow !== null ? clamp(45 + (latest.freeCashFlow > 0 ? 25 : -30), 0, 100) : null, debtGrowth === null ? null : clamp(65 - Math.max(0, debtGrowth) * 180, 0, 100)];
  const capitalAllocationScore = mean(allocationInputs.filter((value): value is number => value !== null));
  const dilutionAlignment = shareGrowth === null ? null : clamp(70 - Math.max(0, shareGrowth) * 700 + Math.max(0, -shareGrowth) * 150, 0, 100);
  const shareholderAlignmentScore = mean([dilutionAlignment, insiderSignal?.score ?? null].filter((value): value is number => value !== null));
  if (revenueGrowth !== null) evidence.push(`Observed revenue growth ${(revenueGrowth * 100).toFixed(1)}%.`);
  if (fcfGrowth !== null) evidence.push(`Observed FCF growth ${(fcfGrowth * 100).toFixed(1)}%.`);
  if (shareGrowth !== null && shareGrowth > 0.03) warnings.push("Material year-over-year dilution observed.");
  if (debtGrowth !== null && debtGrowth > 0.2) warnings.push("Debt increased materially year over year.");
  if (latest.acquisitions !== null) evidence.push("Provider-reported acquisition cash flow is included; acquisition quality requires deal-level evidence.");
  if (insiderSignal?.netShares !== null && insiderSignal?.netShares !== undefined) evidence.push(`Verified insider activity: ${insiderSignal.purchases} acquisitions, ${insiderSignal.sales} dispositions, net ${insiderSignal.netShares.toLocaleString()} shares.`);
  const overallScore = mean([executionScore, capitalAllocationScore, shareholderAlignmentScore].filter((value): value is number => value !== null));
  return { executionScore, capitalAllocationScore, shareholderAlignmentScore, credibilityScore: null, overallScore, evidence, warnings: [...warnings, "Guidance accuracy, incentives and executive turnover require structured external disclosures."], confidence: confidence([executionScore, capitalAllocationScore, shareholderAlignmentScore, insiderSignal?.score ?? null].filter((value) => value !== null).length), modelVersion: MANAGEMENT_MODEL_VERSION };
}

export function compareVerifiedPeers(company: { symbol: string; name: string; metrics: Record<string, number | null>; provider: string }, peers: Array<{ symbol: string; name: string; metrics: Record<string, number | null>; provider: string; verified: boolean }>): PeerComparison[] {
  const verified = peers.filter((peer) => peer.verified && peer.symbol !== company.symbol).slice(0, 10);
  const group = [{ ...company, verified: true }, ...verified];
  return group.map((peer) => {
    const percentiles: Record<string, number | null> = {};
    for (const [key, value] of Object.entries(peer.metrics)) {
      const values = group.flatMap((item) => typeof item.metrics[key] === "number" ? [item.metrics[key] as number] : []);
      if (value === null || values.length < 3) percentiles[key] = null;
      else {
        const below = values.filter((candidate) => candidate <= value).length;
        percentiles[key] = percentile([below / values.length * 100], 0.5);
      }
    }
    return { symbol: peer.symbol, name: peer.name, verified: peer.verified, metrics: peer.metrics, percentiles, provider: peer.provider };
  });
}
