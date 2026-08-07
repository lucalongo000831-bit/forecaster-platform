import "server-only";

import { jsonFailure, jsonSuccess } from "@/lib/server/api-response";
import { createRequestContext } from "@/lib/server/request-context";
import { symbolSchema } from "@/schemas";
import { enforceCompanyAnalysisRateLimit } from "./company-analysis-access";
import { getCompanyIntelligence } from "./company-intelligence-service";

export type CompanySection = "analysis" | "summary" | "quality" | "earnings-quality" | "cash-flow" | "moat" | "management" | "peers" | "valuation" | "reverse-dcf" | "dcf" | "scenarios" | "targets" | "horizons" | "daily-outlook" | "calendar" | "risks" | "catalysts";

function sectionData(report: Awaited<ReturnType<typeof getCompanyIntelligence>>, section: CompanySection) {
  if (section === "analysis") return report;
  if (section === "summary") return { symbol: report.symbol, name: report.name, exchange: report.exchange, sector: report.sector, industry: report.industry, currency: report.currency, currentPrice: report.currentPrice, dailyChangePercent: report.dailyChangePercent, marketCap: report.marketCap, marketState: report.marketState, verdict: report.verdict, assessment: report.assessment, overallScore: report.overallScore, confidence: report.confidence, dataQuality: report.dataQuality, valuation: report.valuation ? { fairValue: report.valuation.fairValue, prudentFairValue: report.valuation.prudentFairValue, marginOfSafety: report.valuation.marginOfSafety, operationalPrices: report.valuation.operationalPrices, scenarios: report.valuation.scenarios } : null, dataTimestamp: report.dataTimestamp, calculatedAt: report.calculatedAt };
  if (section === "quality") return report.quality;
  if (section === "earnings-quality" || section === "cash-flow") return report.earningsQuality;
  if (section === "moat") return report.moat;
  if (section === "management") return report.management;
  if (section === "peers") return report.peers;
  if (section === "valuation") return report.valuation;
  if (section === "reverse-dcf") return report.valuation?.reverseDcf ?? null;
  if (section === "dcf" || section === "scenarios") return { scenarios: report.valuation?.scenarios ?? [], sensitivity: report.valuation?.sensitivity ?? [], modelVersion: report.valuation?.modelVersion ?? null };
  if (section === "targets") return { operationalPrices: report.valuation?.operationalPrices ?? null, horizons: report.horizons };
  if (section === "horizons") return report.horizons;
  if (section === "daily-outlook") return report.dailyOutlook;
  if (section === "calendar") return report.operationalCalendar;
  if (section === "risks") return report.risks;
  return report.risks?.catalysts ?? [];
}

export function createCompanyGetHandler(section: CompanySection) {
  return async function GET(request: Request, context: { params: Promise<{ symbol: string }> }) {
    const requestContext = createRequestContext(request);
    try {
      await enforceCompanyAnalysisRateLimit(requestContext.ip);
      const { symbol: raw } = await context.params; const symbol = symbolSchema.parse(decodeURIComponent(raw));
      const report = await getCompanyIntelligence(symbol);
      return jsonSuccess(sectionData(report, section), requestContext, { headers: { "Cache-Control": "public, s-maxage=21600, stale-while-revalidate=86400" }, meta: { symbol: report.symbol, provider: [...new Set(report.sources.map((source) => source.provider))], sourceTimestamp: report.dataTimestamp, modelVersion: report.modelVersion, dataQuality: report.dataQuality.confidence } });
    } catch (error) { return jsonFailure(error, requestContext); }
  };
}
