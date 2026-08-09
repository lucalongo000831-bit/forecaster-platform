import type { FundamentalAnalysis } from "@/engines/fundamental";
import { clamp, mean, percentile, sampleStandardDeviation } from "@/engines/shared/statistics";
import type { AutomotiveAnalysis, CompanyConfidence, HistoricalCompanyPeriod, ManagementAnalysis, MoatAnalysis, MoatCategoryAssessment, PeerComparison } from "@/types";

export const MOAT_MODEL_VERSION = "moat-v1.1.0";
export const MANAGEMENT_MODEL_VERSION = "management-capital-allocation-v1.0.0";
export const PEER_MODEL_VERSION = "peer-comparison-v1.0.0";

const moatCategories = ["brand", "economies of scale", "manufacturing scale", "purchasing power", "distribution", "dealer network", "platform sharing", "intellectual property", "software ecosystem", "battery/EV strategy", "supply chain", "regulation", "switching costs", "cost advantage", "geographic diversification", "technology leadership"];
function confidence(count: number): CompanyConfidence { return count >= 5 ? "HIGH" : count >= 3 ? "MEDIUM" : count ? "LOW" : "VERY_LOW"; }
function category(name: string, score: number | null, quantitativeEvidence: string[], threats: string[], qualitativeEvidence: string[] = []): MoatCategoryAssessment {
  const strength = score === null ? "UNCERTAIN" : score >= 80 ? "STRONG" : score >= 60 ? "MODERATE" : score >= 40 ? "WEAK" : "NONE";
  return { category: name, present: score === null ? null : score >= 60, strength, durationYears: null, assessment: strength === "UNCERTAIN" ? "Insufficient structured evidence." : `Evidence-based strength: ${strength}.`, evidence: [...quantitativeEvidence, ...qualitativeEvidence], counterEvidence: threats, quantitativeSupport: { score }, quantitativeEvidence, qualitativeEvidence, threats, confidence: confidence(quantitativeEvidence.length + qualitativeEvidence.length) };
}

export function analyzeMoat(fundamental: FundamentalAnalysis | null, periods: HistoricalCompanyPeriod[], automotive?: AutomotiveAnalysis | null): MoatAnalysis {
  const margin = fundamental?.metrics.operatingMargin ?? null;
  const roic = fundamental?.metrics.returnOnInvestedCapital ?? null;
  const revenue = periods.flatMap((row) => row.revenue === null ? [] : [row.revenue]);
  const revenueDispersion = revenue.length >= 3 ? sampleStandardDeviation(revenue.map((value, index) => index === revenue.length - 1 ? 0 : value / (revenue[index + 1] || value) - 1)) : null;
  const shipmentScale = automotive?.consolidatedShipments ?? null;
  const scaleScore = margin === null && shipmentScale === null ? null : clamp(35 + (margin ?? 0) * 140 + (revenueDispersion !== null && revenueDispersion < 0.12 ? 12 : 0) + (shipmentScale !== null ? Math.min(25, Math.log10(Math.max(1, shipmentScale)) * 3.5) : 0), 0, 100);
  const costScore = margin === null || roic === null ? null : clamp(35 + margin * 110 + roic * 130, 0, 100);
  const segmentShares = automotive?.segments.flatMap((segment) => segment.shareOfRevenue === null ? [] : [segment.shareOfRevenue]) ?? [];
  const concentration = segmentShares.length ? Math.max(...segmentShares) : null;
  const geographicScore = concentration === null ? null : clamp(85 - concentration * 80 + Math.min(15, segmentShares.length * 2), 0, 100);
  const brandCount = automotive?.brandPortfolio.length ?? 0;
  const brandScore = brandCount ? clamp(35 + brandCount * 3, 0, 78) : null;
  const purchasingScore = shipmentScale === null ? null : clamp(35 + Math.log10(Math.max(1, shipmentScale)) * 3, 0, 58);
  const distributionScore = automotive?.dealerFinanceOffering && segmentShares.length >= 3 ? 52 : null;
  const platformScore = automotive?.centralizedDesignAndManufacturing && shipmentScale !== null ? 55 : null;
  const categories = moatCategories.map((name) => {
    if (name === "brand") return category(name, brandScore, brandCount ? [`${brandCount} automotive brands extracted from the official annual filing.`] : [], ["Portfolio breadth alone does not prove pricing power or durable customer preference."], automotive?.brandPortfolio.length ? [`Official portfolio: ${automotive.brandPortfolio.join(", ")}.`] : []);
    if (["economies of scale", "manufacturing scale"].includes(name)) return category(name, scaleScore, [margin === null ? "" : `IFRS operating margin ${(margin * 100).toFixed(1)}%.`, shipmentScale === null ? "" : `${(shipmentScale / 1_000_000).toFixed(2)} million consolidated shipments.`, revenueDispersion === null ? "" : `Revenue-growth dispersion ${(revenueDispersion * 100).toFixed(1)}%.`].filter(Boolean), ["Automotive fixed-cost absorption can reverse in a volume downcycle."]);
    if (name === "purchasing power") return category(name, purchasingScore, shipmentScale === null ? [] : [`${(shipmentScale / 1_000_000).toFixed(2)} million consolidated shipments provide indirect scale evidence.`], ["Supplier terms and bill-of-material savings were not disclosed; the assessment is capped at WEAK."]);
    if (["distribution", "dealer network"].includes(name)) return category(name, distributionScore, segmentShares.length ? [`Structured revenue is reported across ${segmentShares.length} geographic segments.`] : [], ["Dealer count, throughput and exclusivity were not disclosed; the assessment is capped at WEAK."], automotive?.dealerFinanceOffering ? ["The official filing confirms retail and dealer financing, leasing and rental services."] : []);
    if (name === "platform sharing") return category(name, platformScore, shipmentScale === null ? [] : [`${(shipmentScale / 1_000_000).toFixed(2)} million consolidated shipments use a centralized operating footprint.`], ["Platform-level unit economics and commonality rates were not disclosed; the assessment is capped at WEAK."], automotive?.centralizedDesignAndManufacturing ? ["The official filing states that design, engineering, development and manufacturing operations are centralized."] : []);
    if (name === "cost advantage") return category(name, costScore, [margin === null ? "" : `Operating margin ${(margin * 100).toFixed(1)}%.`, roic === null ? "" : `ROIC ${(roic * 100).toFixed(1)}%.`].filter(Boolean), ["Margins and ROIC do not prove the source or durability of cost advantage."]);
    if (name === "geographic diversification") return category(name, geographicScore, [concentration === null ? "" : `Largest reportable segment represents ${(concentration * 100).toFixed(1)}% of mapped segment revenue.`, segmentShares.length ? `${segmentShares.length} reportable segments have structured revenue data.` : ""].filter(Boolean), ["Regional diversity also creates FX, tariff and regulatory exposure."]);
    return category(name, null, [], ["No sufficiently structured evidence was available for this category."]);
  });
  const scored = categories.filter((item) => item.strength !== "UNCERTAIN");
  const scores = [scaleScore, costScore, geographicScore].filter((value): value is number => value !== null);
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
