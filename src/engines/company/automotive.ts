import type { OfficialAutomotiveMetrics } from "@/providers/official/document-adapter";
import { clamp, mean, sampleStandardDeviation } from "@/engines/shared/statistics";
import type { AutomotiveAnalysis, CompanyConfidence, HistoricalCompanyPeriod } from "@/types";

export const AUTOMOTIVE_MODEL_VERSION = "automotive-metrics-v1.0.0";

function ratio(numerator: number | null | undefined, denominator: number | null | undefined) {
  return numerator === null || numerator === undefined || denominator === null || denominator === undefined || denominator === 0 ? null : numerator / denominator;
}

function confidence(available: number): CompanyConfidence {
  return available >= 8 ? "HIGH" : available >= 5 ? "MEDIUM" : available >= 2 ? "LOW" : "VERY_LOW";
}

export function analyzeAutomotiveMetrics(input: { history: HistoricalCompanyPeriod[]; official: OfficialAutomotiveMetrics | null }): AutomotiveAnalysis {
  const latest = input.history[0]; const prior = input.history[1]; const official = input.official;
  const revenueGrowth = input.history.slice(0, -1).flatMap((period, index) => period.revenue !== null && input.history[index + 1]?.revenue ? [period.revenue / input.history[index + 1]!.revenue! - 1] : []);
  const marginHistory = input.history.flatMap((period) => period.operatingIncome !== null && period.revenue ? [period.operatingIncome / period.revenue] : []);
  const revenueVolatility = sampleStandardDeviation(revenueGrowth); const marginVolatility = sampleStandardDeviation(marginHistory);
  const inventoryGrowth = ratio(latest?.inventory, prior?.inventory); const inventoryChange = inventoryGrowth === null ? null : inventoryGrowth - 1;
  const cyclicalityInputs = [revenueVolatility === null ? null : clamp(revenueVolatility * 400, 0, 100), marginVolatility === null ? null : clamp(marginVolatility * 500, 0, 100), inventoryChange === null ? null : clamp(45 + inventoryChange * 180, 0, 100)].filter((value): value is number => value !== null);
  const cyclicalityScore = mean(cyclicalityInputs);
  const totalSegmentRevenue = official?.segments.reduce((sum, segment) => sum + Math.max(0, segment.revenue ?? 0), 0) ?? 0;
  const segments = (official?.segments ?? []).map((segment) => ({
    name: segment.name, revenue: segment.revenue, shareOfRevenue: segment.revenue === null || !totalSegmentRevenue ? null : segment.revenue / totalSegmentRevenue,
    revenueGrowth: segment.revenue === null || !segment.priorRevenue ? null : segment.revenue / segment.priorRevenue - 1,
    adjustedOperatingIncome: segment.adjustedOperatingIncome,
    adjustedOperatingMargin: ratio(segment.adjustedOperatingIncome, segment.revenue),
    shipments: segment.shipments, shipmentGrowth: segment.shipments === null || !segment.priorShipments ? null : segment.shipments / segment.priorShipments - 1,
  }));
  const adjustedOperatingMargin = ratio(official?.adjustedOperatingIncome, latest?.revenue);
  const shipmentGrowth = official?.consolidatedShipments === null || official?.consolidatedShipments === undefined || !official.priorConsolidatedShipments ? null : official.consolidatedShipments / official.priorConsolidatedShipments - 1;
  const inventoryDays = latest?.inventory === null || latest?.inventory === undefined || latest.costOfRevenue === null || latest.costOfRevenue === undefined || latest.costOfRevenue === 0 ? null : latest.inventory / Math.abs(latest.costOfRevenue) * 365;
  const capexToRevenue = latest?.capitalExpenditure === null || latest?.capitalExpenditure === undefined || !latest.revenue ? null : Math.abs(latest.capitalExpenditure) / latest.revenue;
  const assetTurnover = latest?.revenue === null || latest?.revenue === undefined || !latest.totalAssets ? null : latest.revenue / latest.totalAssets;
  const values = [official?.adjustedOperatingIncome, official?.industrialFreeCashFlow, official?.industrialNetFinancialPosition, official?.consolidatedShipments, inventoryDays, capexToRevenue, assetTurnover, cyclicalityScore].filter((value) => typeof value === "number");
  const evidence = [
    official?.consolidatedShipments === null || official?.consolidatedShipments === undefined ? null : `Consolidated shipments ${(official.consolidatedShipments / 1_000_000).toFixed(2)} million.`,
    adjustedOperatingMargin === null ? null : `Official adjusted operating margin ${(adjustedOperatingMargin * 100).toFixed(1)}%.`,
    capexToRevenue === null ? null : `Consolidated capex/revenue ${(capexToRevenue * 100).toFixed(1)}%.`,
    inventoryDays === null ? null : `Inventory equals approximately ${inventoryDays.toFixed(0)} days of cost of sales.`,
  ].filter((value): value is string => value !== null);
  return {
    applicable: true, adjustedOperatingIncome: official?.adjustedOperatingIncome ?? null, adjustedOperatingMargin,
    industrialFreeCashFlow: official?.industrialFreeCashFlow ?? null, consolidatedFreeCashFlow: latest?.freeCashFlow ?? null,
    industrialNetFinancialPosition: official?.industrialNetFinancialPosition ?? null, consolidatedNetDebt: latest?.netDebt ?? null,
    consolidatedShipments: official?.consolidatedShipments ?? null, shipmentGrowth, inventoryDays, capexToRevenue, assetTurnover, cyclicalityScore,
    downcycleSensitivity: cyclicalityScore === null ? "UNKNOWN" : cyclicalityScore >= 65 ? "HIGH" : cyclicalityScore >= 35 ? "MEDIUM" : "LOW",
    segments, brandPortfolio: official?.brandPortfolio ?? [], centralizedDesignAndManufacturing: official?.centralizedDesignAndManufacturing ?? false, dealerFinanceOffering: official?.dealerFinanceOffering ?? false, evidence,
    limitations: ["Industrial free cash flow and industrial net financial position are issuer-defined non-GAAP measures and remain separate from consolidated FCF and net debt.", "Dealer inventory, pricing/mix, incentives and powertrain share remain missing unless the official filing exposes a structured comparable series."],
    confidence: confidence(values.length), sourceUrl: official?.document.sourceUrl ?? null, modelVersion: AUTOMOTIVE_MODEL_VERSION,
  };
}
