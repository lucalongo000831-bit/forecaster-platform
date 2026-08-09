import "server-only";

import { providerCached } from "@/providers/cache";
import { coinGeckoAdapter } from "@/providers/coingecko/adapter";
import { ProviderError } from "@/providers/errors";
import { finnhubCompanyAdapter } from "@/providers/finnhub/company-adapter";
import { providerResult } from "@/providers/metadata";
import { financialProviderRouter } from "@/providers/router";
import type { FieldProvenance, MissingDataReason, ProviderName } from "@/providers/types";
import { getSecForm4Transactions } from "@/providers/sec/form4";
import { resolveInstrument } from "@/services/instruments/instrument-resolver";
import type { AnalysisDataBundle, CryptoDataBundle, EtfDataBundle, MissingDataDetail } from "@/types";
import { normalizeFinancialStatements } from "./statement-normalizer";
import { persistDataBundle } from "./data-bundle-repository";
import { analyzeDividends, analyzeInsiderActivity } from "@/engines/company";

function reason(error: unknown): MissingDataReason {
  if (!(error instanceof ProviderError)) return "PROVIDER_UNAVAILABLE";
  if (error.code === "RATE_LIMITED") return "PROVIDER_RATE_LIMIT";
  if (error.code === "PLAN_RESTRICTED" || error.code === "UNAUTHORIZED") return "PROVIDER_PLAN_LIMIT";
  if (error.code === "NOT_FOUND") return "NOT_REPORTED";
  return "PROVIDER_UNAVAILABLE";
}

function missing(field: string, error: unknown, attemptedProviders: ProviderName[]): MissingDataDetail {
  const why = reason(error);
  const messages: Record<MissingDataReason, string> = { NOT_REPORTED: "Il dato non risulta pubblicato dalle fonti interrogate.", NOT_APPLICABLE: "Il dato non è applicabile a questo strumento.", PROVIDER_PLAN_LIMIT: "Il piano del provider non include questo dato.", PROVIDER_RATE_LIMIT: "Il provider ha temporaneamente esaurito la quota.", PROVIDER_UNAVAILABLE: "Il provider è temporaneamente non disponibile.", IDENTIFIER_UNRESOLVED: "L’identificatore dello strumento non è stato risolto con sufficiente confidenza.", STALE_BEYOND_TOLERANCE: "Il dato disponibile è oltre la soglia di validità.", INSUFFICIENT_HISTORY: "La serie storica non è sufficiente per il calcolo.", DATA_CONFLICT: "Le fonti presentano una divergenza materiale non riconciliata.", CALCULATION_INPUT_MISSING: "Manca almeno un input necessario al calcolo." };
  return { field, reason: why, message: messages[why], attemptedProviders };
}

function provenance(field: string, meta: { provider: ProviderName; sourceTimestamp: string | null; fetchedAt: string; quality: FieldProvenance["quality"] }): FieldProvenance {
  return { field, provider: meta.provider, sourceTimestamp: meta.sourceTimestamp, fetchedAt: meta.fetchedAt, quality: meta.quality };
}

export async function getAnalysisDataBundle(symbolInput: string): Promise<AnalysisDataBundle> {
  const instrument = await resolveInstrument(symbolInput); const symbol = instrument.canonicalSymbol;
  return (await providerCached(`analysis-bundle:${symbol}`, { freshSeconds: 3_600, staleSeconds: 21_600 }, async () => {
    const now = new Date(); const from = new Date(now.getTime() - 730 * 86_400_000).toISOString().slice(0, 10); const to = now.toISOString().slice(0, 10);
    const [quote, profile, summary, income, balance, cashFlow, analyst, peers, insiders, dividends] = await Promise.allSettled([
      financialProviderRouter.quote(symbol), financialProviderRouter.profile(symbol), financialProviderRouter.fundamentals(symbol),
      financialProviderRouter.statements(symbol, "income", "annual", 10), financialProviderRouter.statements(symbol, "balance-sheet", "annual", 10), financialProviderRouter.statements(symbol, "cash-flow", "annual", 10),
      financialProviderRouter.analystConsensus(symbol), financialProviderRouter.peers(symbol), finnhubCompanyAdapter.getInsiderTransactions(symbol, from, to).catch(async () => getSecForm4Transactions(symbol)), financialProviderRouter.dividendCalendar(from, to, symbol),
    ]);
    const missingData: MissingDataDetail[] = []; const lineage: FieldProvenance[] = [];
    const settled = <T>(result: PromiseSettledResult<T>, field: string, providers: ProviderName[]): T | null => { if (result.status === "fulfilled") return result.value; missingData.push(missing(field, result.reason, providers)); return null; };
    const quoteData = settled(quote, "quote", ["massive", "yahoo", "fmp", "eodhd"]); const profileData = settled(profile, "profile", ["fmp", "eodhd", "sec-edgar", "yahoo"]); const summaryData = settled(summary, "fundamentals", ["fmp", "eodhd", "sec-edgar", "yahoo"]);
    const incomeData = settled(income, "incomeStatements", ["fmp", "eodhd", "sec-edgar", "yahoo"]); const balanceData = settled(balance, "balanceSheets", ["fmp", "eodhd", "sec-edgar", "yahoo"]); const cashData = settled(cashFlow, "cashFlowStatements", ["fmp", "eodhd", "sec-edgar", "yahoo"]);
    const analystData = settled(analyst, "analystConsensus", ["fmp", "eodhd", "yahoo"]); const peersData = settled(peers, "peers", ["fmp", "finnhub"]); const insiderData = settled(insiders, "insiderTransactions", ["finnhub", "sec-edgar"]); const dividendData = settled(dividends, "dividends", ["fmp", "eodhd", "yahoo"]);
    for (const [field, item] of [["quote", quoteData], ["profile", profileData], ["fundamentals", summaryData], ["incomeStatements", incomeData], ["balanceSheets", balanceData], ["cashFlowStatements", cashData], ["analystConsensus", analystData], ["peers", peersData], ["dividends", dividendData]] as const) if (item && "meta" in item) lineage.push(provenance(field, item.meta));
    if (insiderData) lineage.push({ field: "insiderTransactions", provider: insiderData.some((item) => "accessionNumber" in item) ? "sec-edgar" : "finnhub", sourceTimestamp: insiderData[0]?.filingDate ?? null, fetchedAt: new Date().toISOString(), quality: insiderData.length ? "verified" : "partial" });
    const statementProvider = incomeData?.meta.provider ?? balanceData?.meta.provider ?? cashData?.meta.provider ?? "calculated";
    const financials = normalizeFinancialStatements({ income: incomeData?.data ?? [], balance: balanceData?.data ?? [], cashFlow: cashData?.data ?? [], provider: statementProvider });
    const insiderTransactions = insiderData as unknown as Array<Record<string, unknown>> ?? []; const dividendEvents = dividendData?.data as unknown as Array<Record<string, unknown>> ?? [];
    const data: AnalysisDataBundle = { instrument, profile: profileData?.data as unknown as Record<string, unknown> ?? null, quote: quoteData?.data as unknown as Record<string, unknown> ?? null, financials, analyst: analystData?.data as unknown as Record<string, unknown> ?? null, peers: peersData?.data ?? [], insiderTransactions, dividends: dividendEvents, insiderSignal: analyzeInsiderActivity(insiderTransactions), dividendAnalytics: analyzeDividends(dividendEvents), provenance: [...lineage, ...financials.flatMap((period) => Object.values(period.provenance))], missing: missingData, calculatedAt: new Date().toISOString() };
    await persistDataBundle("COMPANY", data);
    return providerResult(quoteData?.meta.provider ?? "yahoo", data, { sourceTimestamp: quoteData?.meta.sourceTimestamp ?? null, freshness: "cached", quality: missingData.length ? "partial" : "verified", lineage });
  })).data;
}

export async function getEtfDataBundle(symbolInput: string): Promise<EtfDataBundle> {
  const instrument = await resolveInstrument(symbolInput); const symbol = instrument.canonicalSymbol;
  return (await providerCached(`etf-bundle:${symbol}`, { freshSeconds: 21_600, staleSeconds: 172_800 }, async () => {
    let profile = null; const missingData: MissingDataDetail[] = [];
    try { profile = await finnhubCompanyAdapter.getEtfProfile(symbol); } catch (error) { missingData.push(missing("etfProfile", error, ["finnhub"])); }
    const lineage: FieldProvenance[] = profile ? [{ field: "etfProfile", provider: "finnhub", sourceTimestamp: null, fetchedAt: new Date().toISOString(), quality: profile.holdings.length ? "verified" : "partial" }] : [];
    const data: EtfDataBundle = { instrument, profile, provenance: lineage, missing: missingData, calculatedAt: new Date().toISOString() }; await persistDataBundle("ETF", data);
    return providerResult("finnhub", data, { freshness: "cached", quality: missingData.length ? "partial" : "verified", lineage });
  })).data;
}

export async function getCryptoDataBundle(symbolInput: string): Promise<CryptoDataBundle> {
  const instrument = await resolveInstrument(symbolInput); const symbol = instrument.canonicalSymbol;
  return (await providerCached(`crypto-bundle:${symbol}`, { freshSeconds: 300, staleSeconds: 1_800 }, async () => {
    const [profileResult, globalResult] = await Promise.allSettled([coinGeckoAdapter.getProfile(symbol), coinGeckoAdapter.getGlobalContext()]); const missingData: MissingDataDetail[] = [];
    const profile = profileResult.status === "fulfilled" ? profileResult.value : (missingData.push(missing("cryptoProfile", profileResult.reason, ["coingecko"])), null);
    const global = globalResult.status === "fulfilled" ? globalResult.value : (missingData.push(missing("cryptoGlobal", globalResult.reason, ["coingecko"])), {});
    const lineage: FieldProvenance[] = [{ field: "cryptoProfile", provider: "coingecko", sourceTimestamp: null, fetchedAt: new Date().toISOString(), quality: profile ? "verified" : "unavailable" }, { field: "cryptoGlobal", provider: "coingecko", sourceTimestamp: null, fetchedAt: new Date().toISOString(), quality: globalResult.status === "fulfilled" ? "verified" : "unavailable" }];
    const data: CryptoDataBundle = { instrument, profile, global, provenance: lineage, missing: missingData, calculatedAt: new Date().toISOString() }; await persistDataBundle("CRYPTO", data);
    return providerResult("coingecko", data, { freshness: "cached", quality: missingData.length ? "partial" : "verified", lineage });
  })).data;
}
