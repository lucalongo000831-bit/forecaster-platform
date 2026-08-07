import "server-only";

import { companyAnalysisReports, companyAnalysisSnapshots, getDatabase, instruments, isDatabaseConfigured } from "@/db";
import { structuredLog } from "@/lib/server/logger";
import type { CompanyIntelligenceReport } from "@/types";

export async function persistCompanyAnalysis(report: CompanyIntelligenceReport) {
  if (!isDatabaseConfigured() || !report.applicable) return null;
  try {
    const database = getDatabase();
    const slug = report.symbol.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
    const [instrument] = await database.insert(instruments).values({ canonicalSymbol: report.symbol, name: report.name, slug, type: "EQUITY", currency: report.currency, market: report.market, sector: report.sector, industry: report.industry, active: true }).onConflictDoUpdate({ target: instruments.slug, set: { name: report.name, currency: report.currency, market: report.market, sector: report.sector, industry: report.industry, active: true, updatedAt: new Date() } }).returning({ id: instruments.id });
    const scenario = (name: "BEAR" | "BASE" | "BULL") => report.valuation?.scenarios.find((item) => item.name === name)?.fairValuePerShare ?? null;
    const [snapshot] = await database.insert(companyAnalysisSnapshots).values({
      instrumentId: instrument.id, symbol: report.symbol, market: report.market, score: report.overallScore === null ? null : String(report.overallScore), verdict: report.verdict, shortVerdict: report.risks?.shortEligible ? "SHORT" : null,
      qualityScore: report.quality?.totalScore === null || report.quality?.totalScore === undefined ? null : String(report.quality.totalScore), growthScore: report.quality?.growth.score === null || report.quality?.growth.score === undefined ? null : String(report.quality.growth.score), valuationScore: report.valuation?.marginOfSafety === null || report.valuation?.marginOfSafety === undefined ? null : String(Math.max(0, Math.min(100, 50 + report.valuation.marginOfSafety * 100))), riskScore: report.risks?.overallRiskScore === null || report.risks?.overallRiskScore === undefined ? null : String(report.risks.overallRiskScore), moatScore: report.moat?.score === null || report.moat?.score === undefined ? null : String(report.moat.score), managementScore: report.management?.overallScore === null || report.management?.overallScore === undefined ? null : String(report.management.overallScore), earningsQualityScore: report.earningsQuality?.score === null || report.earningsQuality?.score === undefined ? null : String(report.earningsQuality.score),
      fairValue: report.valuation?.fairValue === null || report.valuation?.fairValue === undefined ? null : String(report.valuation.fairValue), bearValue: scenario("BEAR") === null ? null : String(scenario("BEAR")), baseValue: scenario("BASE") === null ? null : String(scenario("BASE")), bullValue: scenario("BULL") === null ? null : String(scenario("BULL")), attractivePriceLow: report.valuation?.operationalPrices.interesting?.[0] === undefined ? null : String(report.valuation.operationalPrices.interesting[0]), attractivePriceHigh: report.valuation?.operationalPrices.interesting?.[1] === undefined ? null : String(report.valuation.operationalPrices.interesting[1]), avoidPrice: report.valuation?.operationalPrices.avoid?.[0] === undefined ? null : String(report.valuation.operationalPrices.avoid[0]), marginOfSafety: report.valuation?.marginOfSafety === null || report.valuation?.marginOfSafety === undefined ? null : String(report.valuation.marginOfSafety), confidence: report.confidence,
      payload: report as unknown as Record<string, unknown>, modelVersion: report.modelVersion, dataTimestamp: report.dataTimestamp ? new Date(report.dataTimestamp) : null, calculatedAt: new Date(report.calculatedAt), expiresAt: new Date(Date.now() + 24 * 60 * 60_000), providerMetadata: { providers: [...new Set(report.sources.map((source) => source.provider))] }, methodologyMetadata: { scoringVersion: report.scoringVersion, valuationVersion: report.valuationVersion, signalVersion: report.signalVersion, reportVersion: report.reportVersion },
    }).returning({ id: companyAnalysisSnapshots.id });
    return snapshot.id;
  } catch (error) {
    structuredLog("warn", "company.analysis.persistence_failed", { symbol: report.symbol, code: error instanceof Error ? error.name : "UNKNOWN" });
    return null;
  }
}

export async function saveCompanyReport(userId: string, report: CompanyIntelligenceReport) {
  if (!isDatabaseConfigured()) return null;
  try {
    const database = getDatabase(); const slug = report.symbol.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
    const [instrument] = await database.insert(instruments).values({ canonicalSymbol: report.symbol, name: report.name, slug, type: "EQUITY", currency: report.currency, market: report.market, sector: report.sector, industry: report.industry, active: true }).onConflictDoUpdate({ target: instruments.slug, set: { name: report.name, currency: report.currency, market: report.market, updatedAt: new Date() } }).returning({ id: instruments.id });
    const [saved] = await database.insert(companyAnalysisReports).values({ instrumentId: instrument.id, userId, payload: report as unknown as Record<string, unknown>, modelVersion: report.reportVersion, dataTimestamp: report.dataTimestamp ? new Date(report.dataTimestamp) : null, calculatedAt: new Date(report.calculatedAt), providerMetadata: { providers: [...new Set(report.sources.map((source) => source.provider))] }, methodologyMetadata: { modelVersion: report.modelVersion, scoringVersion: report.scoringVersion, valuationVersion: report.valuationVersion } }).returning({ id: companyAnalysisReports.id });
    return saved.id;
  } catch (error) { structuredLog("warn", "company.report.save_failed", { symbol: report.symbol, code: error instanceof Error ? error.name : "UNKNOWN" }); return null; }
}
