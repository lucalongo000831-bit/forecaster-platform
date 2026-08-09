import "server-only";

import { analyzeFundamentals } from "@/engines/fundamental";
import { NEWS_INTELLIGENCE_MODEL_VERSION } from "@/engines/news";
import { TECHNICAL_MODEL_VERSION } from "@/engines/technical";
import { analyzeAutomotiveMetrics, analyzeCompanyQuality, analyzeDailyOutlook, analyzeEarningsQuality, analyzeMacroAndNews, analyzeManagement, analyzeMoat, analyzeTimeHorizons, buildCompanyRiskRegister, buildCompanyValuation, buildHistoricalPeriods, buildOperationalCalendar, calculateCompanyCoverage, compareVerifiedPeers, COMPANY_QUALITY_MODEL_VERSION, COMPANY_REPORT_VERSION, COMPANY_SCORE_VERSION, decideCompany, runCompanyStage, scoreCompany, summarizeSeasonality, validateCompanyData } from "@/engines/company";
import { cacheDelete, cacheGet, cacheSet, withDistributedLock } from "@/lib/server/redis";
import { AppError } from "@/lib/server/app-error";
import { safeExternalHttpsUrl } from "@/lib/safe-url";
import { createSingleFlight } from "@/lib/server/single-flight";
import { revalidateTag, unstable_cache } from "next/cache";
import { financialProviderRouter, type FinancialStatement } from "@/providers";
import { getSeasonalityAnalysis } from "@/services/analysis/seasonality-service";
import { getForecastAnalysis } from "@/services/analysis/forecast-service";
import { getTechnicalAnalysis } from "@/services/analysis/technical-service";
import { getMarketCalendar } from "@/services/calendar/calendar-service";
import { getNewsIntelligence } from "@/services/intelligence/news-service";
import { normalizeSymbol } from "@/services/yahoo/symbol-resolver";
import type { CompanyDataQuality, CompanyIntelligenceReport, CompanySource, MarketProfileDto, PeerComparison } from "@/types";
import { persistCompanyAnalysis } from "./company-analysis-repository";
import { classifyCompanyInstrument } from "./instrument-applicability";
import { getAnalysisDataBundle } from "@/services/financial/data-bundle-service";
import { convertHistoricalPeriods } from "@/services/financial/currency-service";
import { resolveInstrument } from "@/services/instruments/instrument-resolver";
import { officialIssuerSources } from "@/providers/official/issuer-sources";
import { getOfficialAutomotiveMetrics } from "@/providers/official/document-adapter";

export const COMPANY_INTELLIGENCE_MODEL_VERSION = "company-intelligence-v1.4.1";
const cacheKey = (symbol: string) => `company-intelligence:${COMPANY_INTELLIGENCE_MODEL_VERSION}:${symbol}`;
const cacheTag = (symbol: string) => `company-intelligence:${symbol}`;
const companyAnalysisFlight = createSingleFlight<string, CompanyIntelligenceReport>();
const DISTRIBUTED_LOCK_SECONDS = 90;
const CACHE_WAIT_ATTEMPTS = 15;
const PROVIDER_VERSIONS: Record<string, string> = {
  yahoo: "yahoo-finance2@4.0.0 / adapter-v1",
  fmp: "fmp-rest / adapter-v1",
  "alpha-vantage": "alpha-vantage-rest / adapter-v1",
  massive: "massive-rest / adapter-v1",
  eodhd: "eodhd-rest / adapter-v1",
  finnhub: "finnhub-rest / adapter-v1",
  coingecko: "coingecko-rest / adapter-v1",
  "sec-edgar": "sec-edgar-xbrl / adapter-v1",
  esef: "esef-official-filings / adapter-v1",
  calculated: "kairo-deterministic-engines-v1",
};

function profileSource(profile: MarketProfileDto | null, provider: string | null): CompanySource[] {
  return profile && provider ? [{ provider, label: `${profile.name} company profile`, url: safeExternalHttpsUrl(profile.website), timestamp: null, kind: "FACT" }] : [];
}

function providerVersions(sources: CompanySource[]): Record<string, string> {
  return Object.fromEntries(
    [...new Set(sources.map((source) => source.provider))]
      .sort()
      .map((provider) => [provider, PROVIDER_VERSIONS[provider] ?? `${provider}-adapter-v1`]),
  );
}

export async function invalidateCompanyAnalysis(symbolInput: string) {
  const symbol = normalizeSymbol(decodeURIComponent(symbolInput));
  await cacheDelete(cacheKey(symbol));
  revalidateTag(cacheTag(symbol), { expire: 0 });
}

async function waitForCompletedCompanyAnalysis(symbol: string): Promise<CompanyIntelligenceReport | null> {
  for (let attempt = 0; attempt < CACHE_WAIT_ATTEMPTS; attempt += 1) {
    await new Promise((resolve) => setTimeout(resolve, 1_000));
    const cached = await cacheGet<CompanyIntelligenceReport>(cacheKey(symbol));
    if (cached) return cached;
  }
  return null;
}

async function buildCompanyIntelligence(symbol: string): Promise<CompanyIntelligenceReport> {
  const stages = [];
  const quoteStage = await runCompanyStage("LoadMarketData", () => financialProviderRouter.quote(symbol)); stages.push(quoteStage.stage);
  if (!quoteStage.data) {
    if (quoteStage.error) throw quoteStage.error;
    throw new AppError("NOT_FOUND", "Società o ticker non trovato", 404, false);
  }
  const quote = quoteStage.data;
  const profileStage = await runCompanyStage("LoadCompanyProfile", () => financialProviderRouter.profile(symbol));
  stages.push(profileStage.stage);
  const profile = profileStage.data?.data ?? null;
  const instrumentStage = await runCompanyStage("ResolveCanonicalIssuer", () => resolveInstrument(symbol));
  stages.push(instrumentStage.stage);
  const resolvedInstrument = instrumentStage.data;
  const { instrumentType, applicable } = classifyCompanyInstrument(symbol, profile?.quoteType, quote.data.quoteType, profile?.name ?? quote.data.name);
  const automotiveApplicable = /automotive|auto manufacturer|motor vehicle/i.test(`${profile?.sector ?? ""} ${profile?.industry ?? ""}`);
  const sources: CompanySource[] = [{ provider: quote.meta.provider, label: `${symbol} market quote`, url: null, timestamp: quote.meta.sourceTimestamp, kind: "FACT" }, ...profileSource(profile, profileStage.data?.meta.provider ?? null), ...officialIssuerSources(resolvedInstrument ?? null)];
  if (!applicable) {
    const unavailableQuality: CompanyDataQuality = { score: 100, confidence: "HIGH", completeness: 100, stale: false, checks: [{ code: "INSTRUMENT_APPLICABILITY", status: "PASS", message: `Corporate analysis is not applicable to ${instrumentType}.` }], missingFields: [], divergences: [] };
    const report: CompanyIntelligenceReport = { symbol, market: quote.data.exchange, name: profile?.name ?? quote.data.name, exchange: profile?.exchange ?? quote.data.exchange, sector: profile?.sector ?? null, industry: profile?.industry ?? null, currency: quote.data.currency, instrumentType, applicable: false, currentPrice: quote.data.price, dailyChangePercent: quote.data.changePercent, marketCap: quote.data.marketCap, marketState: quote.data.marketState, verdict: "INSUFFICIENT_DATA", assessment: "INSUFFICIENT_DATA", overallScore: null, confidence: "HIGH", dataQuality: unavailableQuality, historical: [], earningsQuality: null, quality: null, moat: null, management: null, peers: [], valuation: null, horizons: [], dailyOutlook: null, seasonality: [], operationalCalendar: [], risks: null, macro: null, thesis: { verdict: "NOT APPLICABLE", whyItMayWork: [], whyItMayFail: [], monitor: [] }, sources, limitations: [`Corporate analysis is not applicable to instrument type ${instrumentType}.`], pipeline: stages, modelVersion: COMPANY_INTELLIGENCE_MODEL_VERSION, scoringVersion: COMPANY_SCORE_VERSION, valuationVersion: "company-valuation-v1.0.0", signalVersion: TECHNICAL_MODEL_VERSION, reportVersion: COMPANY_REPORT_VERSION, providerVersions: providerVersions(sources), dataTimestamp: quote.meta.sourceTimestamp, calculatedAt: new Date().toISOString() };
    await cacheSet(cacheKey(symbol), report, 21_600); return report;
  }
  const [summaryStage, supplementalSummaryStage, annualIncomeStage, annualBalanceStage, annualCashStage, quarterIncomeStage, quarterBalanceStage, quarterCashStage, analystStage, technicalStage, newsStage, bundleStage, officialMetricsStage] = await Promise.all([
    runCompanyStage("LoadFundamentals", () => resolvedInstrument ? financialProviderRouter.fundamentalsForInstrument(resolvedInstrument) : financialProviderRouter.fundamentals(symbol)),
    runCompanyStage("LoadSupplementalMarketFundamentals", () => resolvedInstrument ? financialProviderRouter.supplementalFundamentalsForInstrument(resolvedInstrument) : financialProviderRouter.fundamentals(symbol)),
    runCompanyStage("LoadAnnualIncome", () => resolvedInstrument ? financialProviderRouter.statementsForInstrument(resolvedInstrument, "income", "annual", 10) : financialProviderRouter.statements(symbol, "income", "annual", 10), { empty: (value) => !value.data.length }),
    runCompanyStage("LoadAnnualBalance", () => resolvedInstrument ? financialProviderRouter.statementsForInstrument(resolvedInstrument, "balance-sheet", "annual", 10) : financialProviderRouter.statements(symbol, "balance-sheet", "annual", 10), { empty: (value) => !value.data.length }),
    runCompanyStage("LoadAnnualCashFlow", () => resolvedInstrument ? financialProviderRouter.statementsForInstrument(resolvedInstrument, "cash-flow", "annual", 10) : financialProviderRouter.statements(symbol, "cash-flow", "annual", 10), { empty: (value) => !value.data.length }),
    runCompanyStage("LoadQuarterlyIncome", () => resolvedInstrument ? financialProviderRouter.statementsForInstrument(resolvedInstrument, "income", "quarter", 12) : financialProviderRouter.statements(symbol, "income", "quarter", 12), { empty: (value) => !value.data.length }),
    runCompanyStage("LoadQuarterlyBalance", () => resolvedInstrument ? financialProviderRouter.statementsForInstrument(resolvedInstrument, "balance-sheet", "quarter", 12) : financialProviderRouter.statements(symbol, "balance-sheet", "quarter", 12), { empty: (value) => !value.data.length }),
    runCompanyStage("LoadQuarterlyCashFlow", () => resolvedInstrument ? financialProviderRouter.statementsForInstrument(resolvedInstrument, "cash-flow", "quarter", 12) : financialProviderRouter.statements(symbol, "cash-flow", "quarter", 12), { empty: (value) => !value.data.length }),
    runCompanyStage("LoadAnalystData", () => resolvedInstrument ? financialProviderRouter.analystConsensusForInstrument(resolvedInstrument) : financialProviderRouter.analystConsensus(symbol)),
    runCompanyStage("CalculateTechnicalOutlook", () => getTechnicalAnalysis(symbol, "1m", "^GSPC")),
    runCompanyStage("LoadNews", () => getNewsIntelligence(symbol, 30)),
    runCompanyStage("BuildAnalysisDataBundle", () => getAnalysisDataBundle(symbol)),
    runCompanyStage("LoadOfficialIssuerMetrics", () => automotiveApplicable && resolvedInstrument?.issuer?.cik ? getOfficialAutomotiveMetrics(resolvedInstrument.issuer.cik) : Promise.resolve(null)),
  ]);
  stages.push(summaryStage.stage, supplementalSummaryStage.stage, annualIncomeStage.stage, annualBalanceStage.stage, annualCashStage.stage, quarterIncomeStage.stage, quarterBalanceStage.stage, quarterCashStage.stage, analystStage.stage, technicalStage.stage, newsStage.stage, bundleStage.stage, officialMetricsStage.stage);
  for (const [label, result] of [
    ["Summary fundamentals", summaryStage.data],
    ["Supplemental market fundamentals", supplementalSummaryStage.data],
    ["Annual income statements", annualIncomeStage.data],
    ["Annual balance sheets", annualBalanceStage.data],
    ["Annual cash-flow statements", annualCashStage.data],
    ["Quarterly income statements", quarterIncomeStage.data],
    ["Quarterly balance sheets", quarterBalanceStage.data],
    ["Quarterly cash-flow statements", quarterCashStage.data],
    ["Analyst consensus", analystStage.data],
  ] as const) {
    if (result) sources.push({ provider: result.meta.provider, label, url: null, timestamp: result.meta.sourceTimestamp, kind: "FACT" });
  }
  if (technicalStage.data) sources.push({ provider: technicalStage.data.provider, label: "Historical prices and technical calculations", url: null, timestamp: technicalStage.data.sourceTimestamp, kind: "CALCULATED" });
  if (newsStage.data) sources.push({ provider: newsStage.data.meta.provider, label: "Company news intelligence", url: null, timestamp: newsStage.data.meta.sourceTimestamp, kind: "CALCULATED" });
  const statements = (stage: typeof annualIncomeStage): FinancialStatement[] => stage.data?.data ?? [];
  const peerStage = await runCompanyStage("LoadPeers", () => resolvedInstrument ? financialProviderRouter.peersForInstrument(resolvedInstrument) : financialProviderRouter.peers(symbol), { empty: (value) => !value.data.length }); stages.push(peerStage.stage);
  let peers: PeerComparison[] = await Promise.all((peerStage.data?.data ?? []).slice(0, 5).map(async (peerSymbol) => {
    const [peerProfile, peerFundamentals] = await Promise.all([financialProviderRouter.profile(peerSymbol).catch(() => null), financialProviderRouter.fundamentals(peerSymbol).catch(() => null)]);
    return { symbol: peerSymbol, name: peerProfile?.data.name ?? peerSymbol, verified: Boolean(peerFundamentals), metrics: { marketCap: peerFundamentals?.data.marketCap ?? null, trailingPe: peerFundamentals?.data.trailingPe ?? null, priceToBook: peerFundamentals?.data.priceToBook ?? null, returnOnEquity: peerFundamentals?.data.returnOnEquity ?? null, profitMargins: peerFundamentals?.data.profitMargins ?? null }, percentiles: {}, provider: peerFundamentals?.meta.provider ?? peerStage.data!.meta.provider };
  }));
  if (peerStage.data) sources.push({ provider: peerStage.data.meta.provider, label: "Verified company peer set", url: null, timestamp: peerStage.data.meta.sourceTimestamp, kind: "FACT" });
  const income = [...statements(annualIncomeStage), ...statements(quarterIncomeStage)]; const balance = [...statements(annualBalanceStage), ...statements(quarterBalanceStage)]; const cashFlow = [...statements(annualCashStage), ...statements(quarterCashStage)];
  const historical = buildHistoricalPeriods({ income, balance, cashFlow });
  const annualHistory = historical.filter((row) => row.period === "annual");
  const reportingCurrencies = [...new Set(annualHistory.map((row) => row.currency).filter((value): value is string => Boolean(value)))];
  const needsCurrencyConversion = reportingCurrencies.some((currency) => currency !== quote.data.currency);
  const currencyStage = await runCompanyStage("NormalizeReportingCurrency", () => needsCurrencyConversion ? convertHistoricalPeriods(annualHistory, quote.data.currency) : Promise.resolve(annualHistory), { empty: (value) => annualHistory.length > 0 && !value.length }); stages.push(currencyStage.stage);
  const analyticalHistory = currencyStage.data ?? (needsCurrencyConversion ? [] : annualHistory);
  const filingShares = summaryStage.data?.data.sharesOutstanding ?? supplementalSummaryStage.data?.data.sharesOutstanding ?? null;
  const filingMarketCap = filingShares !== null && quote.data.currency === (resolvedInstrument?.issuer?.reportingCurrency ?? quote.data.currency) ? quote.data.price * filingShares : null;
  const marketCap = filingMarketCap ?? quote.data.marketCap ?? summaryStage.data?.data.marketCap ?? null;
  const latestAnnual = analyticalHistory[0];
  const primarySummary = summaryStage.data?.data ?? supplementalSummaryStage.data?.data ?? null;
  const supplementalSummary = supplementalSummaryStage.data?.data ?? null;
  const trailingDividend = bundleStage.data?.dividendAnalytics.trailingAmount ?? null;
  const reconciledSummary = primarySummary ? {
    ...supplementalSummary,
    ...primarySummary,
    marketCap,
    enterpriseValue: marketCap !== null && latestAnnual?.netDebt !== null && latestAnnual?.netDebt !== undefined ? marketCap + latestAnnual.netDebt : primarySummary.enterpriseValue,
    trailingEps: latestAnnual?.dilutedEps ?? primarySummary.trailingEps,
    revenue: latestAnnual?.revenue ?? primarySummary.revenue,
    freeCashflow: latestAnnual?.freeCashFlow ?? primarySummary.freeCashflow,
    forwardPe: supplementalSummary?.forwardPe ?? primarySummary.forwardPe,
    priceToBook: supplementalSummary?.priceToBook ?? primarySummary.priceToBook,
    dividendYield: trailingDividend !== null && quote.data.price > 0 ? trailingDividend / quote.data.price : supplementalSummary?.dividendYield ?? primarySummary.dividendYield,
  } : null;
  const fundamental = reconciledSummary ? analyzeFundamentals({ symbol, summary: reconciledSummary, income: statements(annualIncomeStage), balanceSheet: statements(annualBalanceStage), cashFlow: statements(annualCashStage), ratios: [], analyst: analystStage.data?.data ?? null, source: summaryStage.data?.meta.provider ?? supplementalSummaryStage.data!.meta.provider }) : null;
  peers = compareVerifiedPeers({ symbol, name: profile?.name ?? quote.data.name, metrics: { marketCap, trailingPe: fundamental?.metrics.trailingPe ?? null, priceToBook: fundamental?.metrics.priceToBook ?? null, returnOnEquity: fundamental?.metrics.returnOnEquity ?? null, profitMargins: fundamental?.metrics.netMargin ?? null }, provider: summaryStage.data?.meta.provider ?? supplementalSummaryStage.data?.meta.provider ?? "calculated" }, peers);
  const dataTimestamp = annualHistory[0]?.fiscalDate ?? quote.meta.sourceTimestamp;
  const dataQuality = validateCompanyData({ income, balance, cashFlow, periods: historical, dataTimestamp });
  if (filingMarketCap !== null && quote.data.marketCap !== null) {
    const relativeDifference = Math.abs(filingMarketCap - quote.data.marketCap) / Math.max(Math.abs(filingMarketCap), Math.abs(quote.data.marketCap), 1);
    dataQuality.checks.push({ code: "MARKET_CAP_RECONCILIATION", status: relativeDifference <= 0.1 ? "PASS" : "WARN", message: relativeDifference <= 0.1 ? "Listing market cap reconciles with official period-end common shares." : "Provider market cap diverges from listing price multiplied by official period-end common shares; the reconciled value is used." });
    if (relativeDifference > 0.1) {
      dataQuality.divergences.push(`Provider market cap differs by ${(relativeDifference * 100).toFixed(1)}% from price × official period-end common shares.`);
      dataQuality.score = Math.max(0, dataQuality.score - 6);
    }
  }
  if (fundamental) { dataQuality.completeness = Math.max(dataQuality.completeness, fundamental.dataCompleteness * 0.75); dataQuality.score = Math.max(dataQuality.score, fundamental.dataCompleteness * 0.65); }
  const earningsQuality = analyzeEarningsQuality(analyticalHistory, marketCap);
  const automotive = automotiveApplicable ? analyzeAutomotiveMetrics({ history: analyticalHistory, official: officialMetricsStage.data?.data ?? null }) : null;
  if (officialMetricsStage.data) sources.push({ provider: officialMetricsStage.data.meta.provider, label: "Official filing automotive metrics", url: officialMetricsStage.data.data.document.sourceUrl, timestamp: officialMetricsStage.data.data.document.publicationDate, kind: "FACT" });
  const moat = analyzeMoat(fundamental, analyticalHistory, automotive); const management = analyzeManagement(analyticalHistory, bundleStage.data?.insiderSignal);
  const quality = analyzeCompanyQuality({ fundamental, earningsQuality, periods: analyticalHistory, moatScore: moat.score, managementScore: management.overallScore });
  const valuation = analyticalHistory.length ? buildCompanyValuation({ currentPrice: quote.data.price, fundamental, historical: analyticalHistory, analyst: analystStage.data?.data ?? null, technicalTarget: technicalStage.data?.analysis.structure.resistance20 ?? null, qualityScore: quality.totalScore }) : null;
  const macroNews = analyzeMacroAndNews({ sector: profile?.sector ?? null, industry: profile?.industry ?? null, country: profile?.country ?? null, currency: quote.data.currency, news: newsStage.data?.analysis ?? null });
  sources.push(...macroNews.sources);
  const risks = buildCompanyRiskRegister({ fundamental, earnings: earningsQuality, quality, valuation, technical: technicalStage.data?.analysis ?? null, periods: analyticalHistory, automotive, knownCatalysts: macroNews.catalysts });
  quality.moat = { ...quality.moat, score: moat.score, confidence: moat.confidence }; quality.management = { ...quality.management, score: management.overallScore, confidence: management.confidence };
  const scored = scoreCompany({ quality, valuation, risks, momentum: technicalStage.data?.analysis.score ?? null, sentiment: newsStage.data?.analysis.aggregate.averageSentiment ?? null });
  const decision = decideCompany({ score: scored.score, qualityScore: quality.totalScore, marginOfSafety: valuation?.marginOfSafety ?? null, riskScore: risks.overallRiskScore, shortEligible: risks.shortEligible, dataCompleteness: Math.min(dataQuality.completeness, scored.completeness) });
  const horizons = analyzeTimeHorizons({ currentPrice: quote.data.price, qualityScore: quality.totalScore, technicalScore: technicalStage.data?.analysis.score ?? null, riskScore: risks.overallRiskScore, historicalGrowth: fundamental?.metrics.freeCashFlowGrowthYoY ?? fundamental?.metrics.revenueCagr5Y ?? null, valuation, asOf: dataTimestamp ?? new Date().toISOString() });
  const dailyOutlook = technicalStage.data ? analyzeDailyOutlook({ technical: technicalStage.data.analysis, marketState: quote.data.marketState, open: quote.data.open, high: quote.data.dayHigh, low: quote.data.dayLow, previousClose: quote.data.previousClose }) : null;
  const [seasonalityStages, forecastStage] = await Promise.all([
    Promise.all((["1Y", "5Y", "10Y", "15Y", "20Y"] as const).map((window) => runCompanyStage(`Seasonality${window}`, () => getSeasonalityAnalysis(symbol, window)))),
    runCompanyStage("CalculateProbabilisticForecast", () => getForecastAnalysis(symbol, "1m", undefined, undefined, quote.data.currency)),
  ]); stages.push(...seasonalityStages.map((item) => item.stage), forecastStage.stage);
  const seasonality = summarizeSeasonality(seasonalityStages.flatMap((item) => item.data ? [item.data] : []));
  const coverage = calculateCompanyCoverage({ instrument: resolvedInstrument ?? null, quote: { ...quote.data, marketCap }, history: analyticalHistory, fundamental, valuation, analyst: analystStage.data?.data ?? null, peers, management, moat, automotive, risks, seasonality, dataQuality, insiders: bundleStage.data?.insiderTransactions ?? [], dividends: bundleStage.data?.dividends ?? [], ownership: bundleStage.data?.ownership ?? null, technicalAvailable: Boolean(technicalStage.data), forecastAvailable: Boolean(forecastStage.data?.analysis) });
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
    symbol, market: quote.data.exchange, name: profile?.name ?? quote.data.name, exchange: profile?.exchange ?? quote.data.exchange, sector: profile?.sector ?? null, industry: profile?.industry ?? null, currency: quote.data.currency, instrumentType, applicable: true, currentPrice: quote.data.price, dailyChangePercent: quote.data.changePercent, marketCap, marketState: quote.data.marketState,
    verdict: decision.verdict, assessment: decision.assessment, overallScore: scored.score, confidence: scored.confidence, dataQuality, historical, earningsQuality, quality, moat, management, peers, valuation, horizons, dailyOutlook, seasonality, operationalCalendar, risks, macro: macroNews.macro, automotive, coverage, forecast: forecastStage.data?.analysis ?? null, ownership: bundleStage.data?.ownership ?? null,
    thesis: { verdict: decision.verdict.replaceAll("_", " "), whyItMayWork: [...quality.growth.positives, ...quality.profitability.positives, ...macroNews.catalysts.filter((item) => item.direction === "POSITIVE").slice(0, 3).map((item) => item.title)], whyItMayFail: [...risks.redFlags.slice(0, 5).map((item) => item.evidence), ...risks.items.slice(0, 3).map((item) => item.description)], monitor: [...risks.items.flatMap((item) => item.indicators).slice(0, 5), ...macroNews.catalysts.slice(0, 3).map((item) => item.title)] },
    sources, fieldProvenance: bundleStage.data?.provenance ?? [], missingData: bundleStage.data?.missing ?? [], limitations: [...limitations, ...(bundleStage.data?.missing.map((item) => `${item.field}: ${item.message} [${item.reason}]`) ?? [])], pipeline: stages, modelVersion: COMPANY_INTELLIGENCE_MODEL_VERSION, scoringVersion: COMPANY_SCORE_VERSION, valuationVersion: valuation?.modelVersion ?? "company-valuation-v1.0.0", signalVersion: technicalStage.data?.analysis.modelVersion ?? TECHNICAL_MODEL_VERSION, reportVersion: COMPANY_REPORT_VERSION, providerVersions: providerVersions(sources), dataTimestamp, calculatedAt: new Date().toISOString(),
  };
  await cacheSet(cacheKey(symbol), report, 21_600); await persistCompanyAnalysis(report); return report;
}

export async function getCompanyIntelligence(symbolInput: string, options?: { refresh?: boolean }): Promise<CompanyIntelligenceReport> {
  const symbol = normalizeSymbol(decodeURIComponent(symbolInput));
  if (!options?.refresh) {
    const cached = await cacheGet<CompanyIntelligenceReport>(cacheKey(symbol));
    if (cached) return cached;
  }
  const coordinatedBuild = () => companyAnalysisFlight.run(symbol, async () => {
    if (!options?.refresh) {
      const cached = await cacheGet<CompanyIntelligenceReport>(cacheKey(symbol));
      if (cached) return cached;
    }
    const result = await withDistributedLock(
      `company-intelligence:${COMPANY_INTELLIGENCE_MODEL_VERSION}:${symbol}`,
      DISTRIBUTED_LOCK_SECONDS,
      () => buildCompanyIntelligence(symbol),
    );
    if (result) return result;
    const completed = await waitForCompletedCompanyAnalysis(symbol);
    if (completed) return completed;
    throw new AppError("PROVIDER_UNAVAILABLE", "Analisi già in elaborazione. Riprova tra pochi secondi", 503, true, 2);
  });
  if (options?.refresh) return coordinatedBuild();
  return unstable_cache(coordinatedBuild, [cacheKey(symbol)], {
    revalidate: 21_600,
    tags: [cacheTag(symbol)],
  })();
}

export const companyIntelligenceVersions = { model: COMPANY_INTELLIGENCE_MODEL_VERSION, scoring: COMPANY_SCORE_VERSION, quality: COMPANY_QUALITY_MODEL_VERSION, valuation: "company-valuation-v1.1.0", signal: TECHNICAL_MODEL_VERSION, news: NEWS_INTELLIGENCE_MODEL_VERSION, report: COMPANY_REPORT_VERSION };
