import "server-only";

import { analyzeFundamentals } from "@/engines/fundamental";
import { NEWS_INTELLIGENCE_MODEL_VERSION } from "@/engines/news";
import { TECHNICAL_MODEL_VERSION } from "@/engines/technical";
import { analyzeCompanyQuality, analyzeDailyOutlook, analyzeEarningsQuality, analyzeMacroAndNews, analyzeManagement, analyzeMoat, analyzeTimeHorizons, buildCompanyRiskRegister, buildCompanyValuation, buildHistoricalPeriods, buildOperationalCalendar, COMPANY_QUALITY_MODEL_VERSION, COMPANY_REPORT_VERSION, COMPANY_SCORE_VERSION, decideCompany, runCompanyStage, scoreCompany, summarizeSeasonality, validateCompanyData } from "@/engines/company";
import { cacheDelete, cacheGet, cacheSet } from "@/lib/server/redis";
import { AppError } from "@/lib/server/app-error";
import { financialProviderRouter, type FinancialStatement } from "@/providers";
import { getSeasonalityAnalysis } from "@/services/analysis/seasonality-service";
import { getTechnicalAnalysis } from "@/services/analysis/technical-service";
import { getMarketCalendar } from "@/services/calendar/calendar-service";
import { getNewsIntelligence } from "@/services/intelligence/news-service";
import { normalizeSymbol } from "@/services/yahoo/symbol-resolver";
import type { CompanyDataQuality, CompanyIntelligenceReport, CompanySource, MarketProfileDto } from "@/types";
import { persistCompanyAnalysis } from "./company-analysis-repository";

export const COMPANY_INTELLIGENCE_MODEL_VERSION = "company-intelligence-v1.0.0";
const corporateTypes = new Set(["EQUITY", "STOCK"]);
const cacheKey = (symbol: string) => `company-intelligence:${COMPANY_INTELLIGENCE_MODEL_VERSION}:${symbol}`;

function profileSource(profile: MarketProfileDto | null, provider: string | null): CompanySource[] {
  return profile && provider ? [{ provider, label: `${profile.name} company profile`, url: profile.website, timestamp: null, kind: "FACT" }] : [];
}

export async function invalidateCompanyAnalysis(symbolInput: string) { await cacheDelete(cacheKey(normalizeSymbol(decodeURIComponent(symbolInput)))); }

export async function getCompanyIntelligence(symbolInput: string, options?: { refresh?: boolean }): Promise<CompanyIntelligenceReport> {
  const symbol = normalizeSymbol(decodeURIComponent(symbolInput));
  if (!options?.refresh) { const cached = await cacheGet<CompanyIntelligenceReport>(cacheKey(symbol)); if (cached) return cached; }
  const stages = [];
  const quoteStage = await runCompanyStage("LoadMarketData", () => financialProviderRouter.quote(symbol)); stages.push(quoteStage.stage);
  if (!quoteStage.data) throw new AppError("NOT_FOUND", "Società o ticker non trovato", 404, false);
  const quote = quoteStage.data;
  const [profileStage, summaryStage, annualIncomeStage, annualBalanceStage, annualCashStage, quarterIncomeStage, quarterBalanceStage, quarterCashStage, analystStage, technicalStage, newsStage] = await Promise.all([
    runCompanyStage("LoadCompanyProfile", () => financialProviderRouter.profile(symbol)),
    runCompanyStage("LoadFundamentals", () => financialProviderRouter.fundamentals(symbol)),
    runCompanyStage("LoadAnnualIncome", () => financialProviderRouter.statements(symbol, "income", "annual", 10), { empty: (value) => !value.data.length }),
    runCompanyStage("LoadAnnualBalance", () => financialProviderRouter.statements(symbol, "balance-sheet", "annual", 10), { empty: (value) => !value.data.length }),
    runCompanyStage("LoadAnnualCashFlow", () => financialProviderRouter.statements(symbol, "cash-flow", "annual", 10), { empty: (value) => !value.data.length }),
    runCompanyStage("LoadQuarterlyIncome", () => financialProviderRouter.statements(symbol, "income", "quarter", 12), { empty: (value) => !value.data.length }),
    runCompanyStage("LoadQuarterlyBalance", () => financialProviderRouter.statements(symbol, "balance-sheet", "quarter", 12), { empty: (value) => !value.data.length }),
    runCompanyStage("LoadQuarterlyCashFlow", () => financialProviderRouter.statements(symbol, "cash-flow", "quarter", 12), { empty: (value) => !value.data.length }),
    runCompanyStage("LoadAnalystData", () => financialProviderRouter.analystConsensus(symbol)),
    runCompanyStage("CalculateTechnicalOutlook", () => getTechnicalAnalysis(symbol, "1m", "^GSPC")),
    runCompanyStage("LoadNews", () => getNewsIntelligence(symbol, 30)),
  ]);
  stages.push(profileStage.stage, summaryStage.stage, annualIncomeStage.stage, annualBalanceStage.stage, annualCashStage.stage, quarterIncomeStage.stage, quarterBalanceStage.stage, quarterCashStage.stage, analystStage.stage, technicalStage.stage, newsStage.stage);
  const profile = profileStage.data?.data ?? null; const instrumentType = (profile?.quoteType ?? quote.data.quoteType).toUpperCase(); const applicable = corporateTypes.has(instrumentType);
  const sources: CompanySource[] = [{ provider: quote.meta.provider, label: `${symbol} market quote`, url: null, timestamp: quote.meta.sourceTimestamp, kind: "FACT" }, ...profileSource(profile, profileStage.data?.meta.provider ?? null)];
  if (!applicable) {
    const unavailableQuality: CompanyDataQuality = { score: 100, confidence: "HIGH", completeness: 100, stale: false, checks: [{ code: "INSTRUMENT_APPLICABILITY", status: "PASS", message: `Corporate analysis is not applicable to ${instrumentType}.` }], missingFields: [], divergences: [] };
    const report: CompanyIntelligenceReport = { symbol, market: quote.data.exchange, name: profile?.name ?? quote.data.name, exchange: profile?.exchange ?? quote.data.exchange, sector: profile?.sector ?? null, industry: profile?.industry ?? null, currency: quote.data.currency, instrumentType, applicable: false, currentPrice: quote.data.price, dailyChangePercent: quote.data.changePercent, marketCap: quote.data.marketCap, marketState: quote.data.marketState, verdict: "INSUFFICIENT_DATA", assessment: "INSUFFICIENT_DATA", overallScore: null, confidence: "HIGH", dataQuality: unavailableQuality, historical: [], earningsQuality: null, quality: null, moat: null, management: null, peers: [], valuation: null, horizons: [], dailyOutlook: null, seasonality: [], operationalCalendar: [], risks: null, macro: null, thesis: { verdict: "NOT APPLICABLE", whyItMayWork: [], whyItMayFail: [], monitor: [] }, sources, limitations: [`Corporate analysis is not applicable to instrument type ${instrumentType}.`], pipeline: stages, modelVersion: COMPANY_INTELLIGENCE_MODEL_VERSION, scoringVersion: COMPANY_SCORE_VERSION, valuationVersion: "company-valuation-v1.0.0", signalVersion: TECHNICAL_MODEL_VERSION, reportVersion: COMPANY_REPORT_VERSION, dataTimestamp: quote.meta.sourceTimestamp, calculatedAt: new Date().toISOString() };
    await cacheSet(cacheKey(symbol), report, 21_600); return report;
  }
  const statements = (stage: typeof annualIncomeStage): FinancialStatement[] => stage.data?.data ?? [];
  const income = [...statements(annualIncomeStage), ...statements(quarterIncomeStage)]; const balance = [...statements(annualBalanceStage), ...statements(quarterBalanceStage)]; const cashFlow = [...statements(annualCashStage), ...statements(quarterCashStage)];
  const historical = buildHistoricalPeriods({ income, balance, cashFlow });
  const annualHistory = historical.filter((row) => row.period === "annual");
  const fundamental = summaryStage.data ? analyzeFundamentals({ symbol, summary: summaryStage.data.data, income: statements(annualIncomeStage), balanceSheet: statements(annualBalanceStage), cashFlow: statements(annualCashStage), ratios: [], analyst: analystStage.data?.data ?? null, source: summaryStage.data.meta.provider }) : null;
  const dataTimestamp = annualHistory[0]?.fiscalDate ?? quote.meta.sourceTimestamp;
  const dataQuality = validateCompanyData({ income, balance, cashFlow, periods: historical, dataTimestamp });
  if (fundamental) { dataQuality.completeness = Math.max(dataQuality.completeness, fundamental.dataCompleteness * 0.75); dataQuality.score = Math.max(dataQuality.score, fundamental.dataCompleteness * 0.65); }
  const earningsQuality = analyzeEarningsQuality(annualHistory, quote.data.marketCap);
  const moat = analyzeMoat(fundamental, annualHistory); const management = analyzeManagement(annualHistory);
  const quality = analyzeCompanyQuality({ fundamental, earningsQuality, periods: annualHistory, moatScore: moat.score, managementScore: management.overallScore });
  const valuation = buildCompanyValuation({ currentPrice: quote.data.price, fundamental, historical: annualHistory, analyst: analystStage.data?.data ?? null, technicalTarget: technicalStage.data?.analysis.structure.resistance20 ?? null, qualityScore: quality.totalScore });
  const macroNews = analyzeMacroAndNews({ sector: profile?.sector ?? null, industry: profile?.industry ?? null, country: profile?.country ?? null, currency: quote.data.currency, news: newsStage.data?.analysis ?? null });
  sources.push(...macroNews.sources);
  const risks = buildCompanyRiskRegister({ fundamental, earnings: earningsQuality, quality, valuation, technical: technicalStage.data?.analysis ?? null, periods: annualHistory, knownCatalysts: macroNews.catalysts });
  quality.moat = { ...quality.moat, score: moat.score, confidence: moat.confidence }; quality.management = { ...quality.management, score: management.overallScore, confidence: management.confidence };
  const scored = scoreCompany({ quality, valuation, risks, momentum: technicalStage.data?.analysis.score ?? null, sentiment: newsStage.data?.analysis.aggregate.averageSentiment ?? null });
  const decision = decideCompany({ score: scored.score, qualityScore: quality.totalScore, marginOfSafety: valuation?.marginOfSafety ?? null, riskScore: risks.overallRiskScore, shortEligible: risks.shortEligible, dataCompleteness: Math.min(dataQuality.completeness, scored.completeness) });
  const horizons = analyzeTimeHorizons({ currentPrice: quote.data.price, qualityScore: quality.totalScore, technicalScore: technicalStage.data?.analysis.score ?? null, riskScore: risks.overallRiskScore, historicalGrowth: fundamental?.metrics.freeCashFlowGrowthYoY ?? fundamental?.metrics.revenueCagr5Y ?? null, valuation, asOf: dataTimestamp ?? new Date().toISOString() });
  const dailyOutlook = technicalStage.data ? analyzeDailyOutlook({ technical: technicalStage.data.analysis, marketState: quote.data.marketState, open: quote.data.open, high: quote.data.dayHigh, low: quote.data.dayLow, previousClose: quote.data.previousClose }) : null;
  const seasonalityStages = await Promise.all((["1Y", "5Y", "10Y", "15Y", "20Y"] as const).map((window) => runCompanyStage(`Seasonality${window}`, () => getSeasonalityAnalysis(symbol, window)))); stages.push(...seasonalityStages.map((item) => item.stage));
  const seasonality = summarizeSeasonality(seasonalityStages.flatMap((item) => item.data ? [item.data] : []));
  const today = new Date(); const calendarEnd = new Date(today); calendarEnd.setUTCDate(calendarEnd.getUTCDate() + 31);
  const calendarStage = await runCompanyStage("OperationalCalendar", () => getMarketCalendar(today.toISOString().slice(0, 10), calendarEnd.toISOString().slice(0, 10), symbol)); stages.push(calendarStage.stage);
  const operationalCalendar = buildOperationalCalendar({ start: today, days: 31, events: calendarStage.data?.events ?? [], daily: dailyOutlook, orientation: horizons.find((item) => item.horizon === "1M")?.orientation ?? "NEUTRAL" });
  const limitations = [
    ...stages.filter((stage) => stage.status !== "complete").map((stage) => `${stage.name}: ${stage.message ?? stage.status}.`),
    ...(annualHistory.length < 5 ? ["Fewer than five annual statement periods were available; long-term quality confidence is reduced."] : []),
    ...(moat.classification === "UNCERTAIN" ? ["Moat remains uncertain without structured competitive disclosures."] : []),
    "This is non-personalized research, not investment advice or a promise of future performance.",
  ];
  const report: CompanyIntelligenceReport = {
    symbol, market: quote.data.exchange, name: profile?.name ?? quote.data.name, exchange: profile?.exchange ?? quote.data.exchange, sector: profile?.sector ?? null, industry: profile?.industry ?? null, currency: quote.data.currency, instrumentType, applicable: true, currentPrice: quote.data.price, dailyChangePercent: quote.data.changePercent, marketCap: quote.data.marketCap, marketState: quote.data.marketState,
    verdict: decision.verdict, assessment: decision.assessment, overallScore: scored.score, confidence: scored.confidence, dataQuality, historical, earningsQuality, quality, moat, management, peers: [], valuation, horizons, dailyOutlook, seasonality, operationalCalendar, risks, macro: macroNews.macro,
    thesis: { verdict: decision.verdict.replaceAll("_", " "), whyItMayWork: [...quality.growth.positives, ...quality.profitability.positives, ...macroNews.catalysts.filter((item) => item.direction === "POSITIVE").slice(0, 3).map((item) => item.title)], whyItMayFail: [...risks.redFlags.slice(0, 5).map((item) => item.evidence), ...risks.items.slice(0, 3).map((item) => item.description)], monitor: [...risks.items.flatMap((item) => item.indicators).slice(0, 5), ...macroNews.catalysts.slice(0, 3).map((item) => item.title)] },
    sources, limitations, pipeline: stages, modelVersion: COMPANY_INTELLIGENCE_MODEL_VERSION, scoringVersion: COMPANY_SCORE_VERSION, valuationVersion: valuation?.modelVersion ?? "company-valuation-v1.0.0", signalVersion: technicalStage.data?.analysis.modelVersion ?? TECHNICAL_MODEL_VERSION, reportVersion: COMPANY_REPORT_VERSION, dataTimestamp, calculatedAt: new Date().toISOString(),
  };
  await cacheSet(cacheKey(symbol), report, 21_600); await persistCompanyAnalysis(report); return report;
}

export const companyIntelligenceVersions = { model: COMPANY_INTELLIGENCE_MODEL_VERSION, scoring: COMPANY_SCORE_VERSION, quality: COMPANY_QUALITY_MODEL_VERSION, valuation: "company-valuation-v1.0.0", signal: TECHNICAL_MODEL_VERSION, news: NEWS_INTELLIGENCE_MODEL_VERSION, report: COMPANY_REPORT_VERSION };
