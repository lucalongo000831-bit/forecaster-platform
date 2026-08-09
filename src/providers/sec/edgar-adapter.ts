import "server-only";

import type { MarketFundamentalsDto, MarketProfileDto } from "@/types";
import { ProviderError } from "../errors";
import { providerResult } from "../metadata";
import { arrayValue, numericValue, objectValue, textValue } from "../shared";
import type { FinancialStatement, FundamentalRatios, FundamentalsProvider, StatementKind, StatementPeriod } from "../types";
import { normalizeCik, secGet, secPublicGet } from "./client";

const tickerCache = new Map<string, { cik: string; title: string; expiresAt: number }>();

async function loadTickerMap() {
  if ([...tickerCache.values()].some((item) => item.expiresAt > Date.now())) return;
  const raw = objectValue(await secPublicGet(new URL("https://www.sec.gov/files/company_tickers.json"), "ticker-map"));
  tickerCache.clear();
  for (const value of Object.values(raw)) {
    const row = objectValue(value); const ticker = textValue(row, "ticker"); const cik = numericValue(row, "cik_str");
    if (ticker && cik !== null) tickerCache.set(ticker.toUpperCase(), { cik: normalizeCik(cik), title: textValue(row, "title") ?? ticker, expiresAt: Date.now() + 30 * 86_400_000 });
  }
}

export async function resolveSecIdentity(symbolInput: string) {
  const symbol = symbolInput.toUpperCase().split(".")[0]!;
  await loadTickerMap();
  const result = tickerCache.get(symbol);
  if (!result) throw new ProviderError("sec-edgar", "NOT_FOUND", "CIK SEC non risolto per il simbolo.", false, 404);
  return { symbol, ...result };
}

type FactObservation = { end: string; val: number; filed: string | null; form: string; fp: string | null; unit: string };
function observations(facts: Record<string, unknown>, tags: string[]) {
  const observationsByTag: FactObservation[] = [];
  for (const tag of tags) {
    const fact = objectValue(facts[tag]); const units = objectValue(fact.units);
    for (const [unit, values] of Object.entries(units)) {
      const rows = arrayValue(values).flatMap((value): FactObservation[] => {
        const row = objectValue(value); const end = textValue(row, "end"); const val = numericValue(row, "val"); const form = textValue(row, "form") ?? "";
        return end && val !== null && /^(10-K|10-Q|20-F|40-F)$/.test(form) ? [{ end, val, filed: textValue(row, "filed"), form, fp: textValue(row, "fp"), unit }] : [];
      });
      observationsByTag.push(...rows);
    }
  }
  // XBRL concepts are frequently superseded over time. Returning after the
  // first populated alias silently drops newer filings that use a successor
  // concept (for example NVIDIA capex and revenue). Keep all compatible
  // aliases and let the filing date select the freshest observation.
  return observationsByTag;
}

export const __test = { observations };

const fieldsByKind: Record<StatementKind, Record<string, string[]>> = {
  income: {
    revenue: ["RevenueFromContractWithCustomerExcludingAssessedTax", "Revenues", "SalesRevenueNet"],
    grossProfit: ["GrossProfit"], operatingIncome: ["OperatingIncomeLoss"], netIncome: ["NetIncomeLoss", "ProfitLoss"],
    ebitda: ["EarningsBeforeInterestTaxesDepreciationAndAmortization"], epsDiluted: ["EarningsPerShareDiluted"], weightedAverageShsOutDil: ["WeightedAverageNumberOfDilutedSharesOutstanding"],
  },
  "balance-sheet": {
    cashAndCashEquivalents: ["CashAndCashEquivalentsAtCarryingValue", "CashCashEquivalentsRestrictedCashAndRestrictedCashEquivalents"], totalAssets: ["Assets"], totalLiabilities: ["Liabilities"], totalStockholdersEquity: ["StockholdersEquity", "StockholdersEquityIncludingPortionAttributableToNoncontrollingInterest"], totalCurrentAssets: ["AssetsCurrent"], totalCurrentLiabilities: ["LiabilitiesCurrent"], goodwill: ["Goodwill"], intangibleAssets: ["FiniteLivedIntangibleAssetsNet", "IndefiniteLivedIntangibleAssetsExcludingGoodwill"], totalDebt: ["LongTermDebtAndFinanceLeaseObligationsCurrent", "LongTermDebtCurrent", "LongTermDebtNoncurrent"],
  },
  "cash-flow": {
    operatingCashFlow: ["NetCashProvidedByUsedInOperatingActivities"], capitalExpenditure: ["PaymentsToAcquirePropertyPlantAndEquipment", "PaymentsToAcquireProductiveAssets"], acquisitionsNet: ["PaymentsToAcquireBusinessesNetOfCashAcquired", "PaymentsToAcquireBusinessTwoNetOfCashAcquired"], commonStockRepurchased: ["PaymentsForRepurchaseOfCommonStock"], commonStockIssued: ["ProceedsFromStockOptionsExercised"], commonStockDividendsPaid: ["PaymentsOfDividendsCommonStock"], stockBasedCompensation: ["ShareBasedCompensation"],
  },
};

async function companyFacts(symbol: string) {
  const identity = await resolveSecIdentity(symbol);
  const raw = objectValue(await secGet(`/api/xbrl/companyfacts/CIK${identity.cik}.json`, "company-facts"));
  return { identity, raw, facts: objectValue(objectValue(raw.facts)["us-gaap"]) };
}

function buildStatements(symbol: string, facts: Record<string, unknown>, kind: StatementKind, period: StatementPeriod, limit: number) {
  const mapped = Object.entries(fieldsByKind[kind]).map(([field, tags]) => [field, observations(facts, tags)] as const);
  const dates = [...new Set(mapped.flatMap(([, rows]) => rows.filter((row) => period === "annual" ? row.form === "10-K" || row.form === "20-F" || row.form === "40-F" : row.form === "10-Q").map((row) => row.end)))].sort().reverse().slice(0, limit);
  return dates.map((fiscalDate): FinancialStatement => {
    const values: Record<string, number | null> = {}; let acceptedAt: string | null = null; let currency: string | null = null;
    for (const [field, rows] of mapped) {
      const candidates = rows.filter((row) => row.end === fiscalDate && (period === "annual" ? row.form !== "10-Q" : row.form === "10-Q")).sort((a, b) => (b.filed ?? "").localeCompare(a.filed ?? ""));
      const selected = candidates[0]; values[field] = selected?.val ?? null;
      if (field === "capitalExpenditure" && values[field] !== null) values[field] = -Math.abs(values[field]!);
      if (selected?.filed && (acceptedAt === null || selected.filed.localeCompare(acceptedAt) > 0)) acceptedAt = selected.filed;
      currency ??= selected?.unit === "USD" ? "USD" : null;
    }
    if (kind === "cash-flow" && values.operatingCashFlow !== null && values.capitalExpenditure !== null) values.freeCashFlow = values.operatingCashFlow! + values.capitalExpenditure!;
    return { symbol, kind, period, fiscalDate, reportedCurrency: currency, acceptedAt, values };
  });
}

export class SecEdgarFundamentalsAdapter implements FundamentalsProvider {
  readonly name = "sec-edgar" as const;
  isConfigured() { return Boolean(process.env.SEC_USER_AGENT); }
  supportsSymbol(symbol: string) { return /^[A-Z][A-Z0-9.-]{0,14}$/.test(symbol) && !symbol.includes("=") && !symbol.startsWith("^") && !symbol.endsWith("-USD") && !/\.[A-Z]{2,4}$/.test(symbol); }

  async getCompanyProfile(symbol: string) {
    const identity = await resolveSecIdentity(symbol); const raw = objectValue(await secGet(`/submissions/CIK${identity.cik}.json`, "submissions"));
    const data: MarketProfileDto = { symbol, name: textValue(raw, "name") ?? identity.title, exchange: arrayValue(raw.exchanges).find((value): value is string => typeof value === "string") ?? "US", quoteType: "EQUITY", currency: "USD", country: textValue(objectValue(raw.addresses), "stateOrCountry"), sector: null, industry: textValue(raw, "sicDescription"), description: null, employees: null, website: textValue(raw, "website", "investorWebsite"), source: "sec-edgar" };
    return providerResult(this.name, data, { freshness: "cached", freshnessType: "END_OF_DAY" });
  }
  async getFundamentals(symbol: string) {
    const { facts } = await companyFacts(symbol); const latest = (tags: string[]) => observations(facts, tags).sort((a, b) => b.end.localeCompare(a.end))[0]?.val ?? null;
    const revenue = latest(fieldsByKind.income.revenue!); const netIncome = latest(fieldsByKind.income.netIncome!); const equity = latest(fieldsByKind["balance-sheet"].totalStockholdersEquity!); const shares = latest(fieldsByKind.income.weightedAverageShsOutDil!); const operating = latest(fieldsByKind["cash-flow"].operatingCashFlow!); const capex = latest(fieldsByKind["cash-flow"].capitalExpenditure!);
    const data: MarketFundamentalsDto = { symbol, marketCap: null, enterpriseValue: null, trailingEps: netIncome !== null && shares ? netIncome / shares : null, trailingPe: null, forwardPe: null, priceToBook: null, dividendRate: null, dividendYield: null, returnOnEquity: netIncome !== null && equity ? netIncome / equity : null, debtToEquity: null, profitMargins: netIncome !== null && revenue ? netIncome / revenue : null, revenue, freeCashflow: operating !== null && capex !== null ? operating - Math.abs(capex) : null, sharesOutstanding: shares, source: "sec-edgar" };
    return providerResult(this.name, data, { freshness: "cached", freshnessType: "END_OF_DAY", quality: revenue === null ? "partial" : "verified" });
  }
  async getStatements(symbol: string, kind: StatementKind, period: StatementPeriod, limit = 5) {
    const { facts } = await companyFacts(symbol); const data = buildStatements(symbol, facts, kind, period, limit);
    if (!data.length) throw new ProviderError(this.name, "NOT_FOUND", "Bilanci SEC non disponibili.", false, 404);
    return providerResult(this.name, data, { sourceTimestamp: data[0]?.acceptedAt ?? data[0]?.fiscalDate ?? null, freshness: "cached", freshnessType: "END_OF_DAY" });
  }
  async getRatios(symbol: string, period: StatementPeriod, limit = 5) { const result = await this.getFundamentals(symbol); const data: FundamentalRatios[] = [{ symbol, period, date: result.meta.sourceTimestamp, values: { returnOnEquity: result.data.returnOnEquity, profitMargin: result.data.profitMargins } }].slice(0, limit); return providerResult(this.name, data, { freshness: "cached", freshnessType: "END_OF_DAY" }); }
  async getAnalystConsensus(): Promise<never> { throw new ProviderError(this.name, "PLAN_RESTRICTED", "SEC non pubblica consensus analyst.", false, 501); }
  async getEarningsCalendar(): Promise<never> { throw new ProviderError(this.name, "PLAN_RESTRICTED", "SEC non è usata per il calendario earnings.", false, 501); }
  async getDividendCalendar(): Promise<never> { throw new ProviderError(this.name, "PLAN_RESTRICTED", "SEC non è usata per il calendario dividendi.", false, 501); }
  async getEconomicCalendar(): Promise<never> { throw new ProviderError(this.name, "PLAN_RESTRICTED", "SEC non pubblica calendario macro.", false, 501); }
}
