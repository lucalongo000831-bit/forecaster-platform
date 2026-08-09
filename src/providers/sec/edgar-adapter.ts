import "server-only";

import type { MarketFundamentalsDto, MarketProfileDto } from "@/types";
import { ProviderError } from "../errors";
import { providerResult } from "../metadata";
import { arrayValue, numericValue, objectValue, textValue } from "../shared";
import type { FinancialStatement, FundamentalRatios, FundamentalsProvider, StatementKind, StatementPeriod } from "../types";
import { normalizeCik, secGet, secPublicGet } from "./client";

const tickerCache = new Map<string, { cik: string; title: string; expiresAt: number }>();

function normalizeLegalName(value: string) {
  return value.toUpperCase().replace(/\b(N\.?V\.?|NV|INCORPORATED|INC|PLC|SA|S\.A\.)\b/g, "").replace(/[^A-Z0-9]+/g, " ").trim();
}

async function loadTickerMap() {
  if ([...tickerCache.values()].some((item) => item.expiresAt > Date.now())) return;
  const raw = objectValue(await secPublicGet(new URL("https://www.sec.gov/files/company_tickers.json"), "ticker-map"));
  tickerCache.clear();
  for (const value of Object.values(raw)) {
    const row = objectValue(value); const ticker = textValue(row, "ticker"); const cik = numericValue(row, "cik_str");
    if (ticker && cik !== null) tickerCache.set(ticker.toUpperCase(), { cik: normalizeCik(cik), title: textValue(row, "title") ?? ticker, expiresAt: Date.now() + 30 * 86_400_000 });
  }
}

export async function resolveSecIdentity(symbolInput: string, issuerName?: string | null) {
  const rawInput = symbolInput.toUpperCase().trim();
  await loadTickerMap();
  if (/^(?:CIK)?\d{1,10}$/.test(rawInput)) {
    const cik = normalizeCik(rawInput);
    const match = [...tickerCache.entries()].find(([, item]) => item.cik === cik);
    if (match) return { symbol: match[0], ...match[1] };
  }
  const symbol = rawInput.split(".")[0]!;
  const result = tickerCache.get(symbol);
  if (!result && issuerName) {
    const target = normalizeLegalName(issuerName);
    const matches = [...tickerCache.entries()].filter(([, item]) => normalizeLegalName(item.title) === target);
    if (matches.length === 1) {
      const [matchedSymbol, matched] = matches[0]!;
      return { symbol: matchedSymbol, ...matched };
    }
  }
  if (!result) throw new ProviderError("sec-edgar", "NOT_FOUND", "CIK SEC non risolto per il simbolo.", false, 404);
  return { symbol, ...result };
}

type FactObservation = { start: string | null; end: string; val: number; filed: string | null; form: string; fp: string | null; unit: string; concept: string; accessionNumber: string | null };
function observations(facts: Record<string, unknown>, tags: string[]) {
  const observationsByTag: FactObservation[] = [];
  for (const tag of tags) {
    const fact = objectValue(facts[tag]); const units = objectValue(fact.units);
    for (const [unit, values] of Object.entries(units)) {
      const rows = arrayValue(values).flatMap((value): FactObservation[] => {
        const row = objectValue(value); const end = textValue(row, "end"); const val = numericValue(row, "val"); const form = textValue(row, "form") ?? "";
        return end && val !== null && /^(10-K|10-Q|20-F|40-F|6-K)$/.test(form) ? [{ start: textValue(row, "start"), end, val, filed: textValue(row, "filed"), form, fp: textValue(row, "fp"), unit, concept: tag, accessionNumber: textValue(row, "accn") }] : [];
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

export const __test = { observations, buildStatements };

const fieldsByKind: Record<StatementKind, Record<string, string[]>> = {
  income: {
    revenue: ["Revenue", "RevenueFromContractsWithCustomers", "RevenueFromContractWithCustomerExcludingAssessedTax", "Revenues", "SalesRevenueNet"],
    costOfRevenue: ["CostOfSales", "CostOfRevenue"], grossProfit: ["GrossProfit"],
    operatingIncome: ["ProfitLossFromOperatingActivities", "OperatingIncomeLoss"],
    pretaxIncome: ["ProfitLossBeforeTax", "IncomeLossFromContinuingOperationsBeforeIncomeTaxesExtraordinaryItemsNoncontrollingInterest"],
    taxExpense: ["IncomeTaxExpenseContinuingOperations", "IncomeTaxExpenseBenefit"],
    netIncome: ["ProfitLossAttributableToOrdinaryEquityHoldersOfParentEntity", "ProfitLoss", "NetIncomeLoss"],
    depreciationAndAmortization: ["AdjustmentsForDepreciationAndAmortisationExpense", "DepreciationDepletionAndAmortization"],
    ebitda: ["EarningsBeforeInterestTaxesDepreciationAndAmortization"],
    eps: ["BasicEarningsLossPerShare", "EarningsPerShareBasic"], epsDiluted: ["DilutedEarningsLossPerShare", "EarningsPerShareDiluted"],
    weightedAverageShsOut: ["WeightedAverageShares", "WeightedAverageNumberOfSharesOutstandingBasic"],
    weightedAverageShsOutDil: ["AdjustedWeightedAverageShares", "WeightedAverageNumberOfDilutedSharesOutstanding"],
  },
  "balance-sheet": {
    cashAndCashEquivalents: ["CashAndCashEquivalents", "CashAndCashEquivalentsAtCarryingValue", "CashCashEquivalentsRestrictedCashAndRestrictedCashEquivalents"],
    shortTermInvestments: ["CurrentFinancialAssets", "ShorttermInvestmentsClassifiedAsCashEquivalents"],
    receivables: ["TradeAndOtherReceivables", "TradeReceivables", "CurrentTradeReceivables", "AccountsReceivableNetCurrent"],
    inventory: ["Inventories", "InventoryNet"], totalCurrentAssets: ["CurrentAssets", "AssetsCurrent"],
    propertyPlantEquipment: ["PropertyPlantAndEquipment", "PropertyPlantAndEquipmentIncludingRightofuseAssets", "PropertyPlantAndEquipmentNet"],
    goodwill: ["Goodwill"], intangibleAssets: ["IntangibleAssetsOtherThanGoodwill", "FiniteLivedIntangibleAssetsNet", "IndefiniteLivedIntangibleAssetsExcludingGoodwill"],
    totalAssets: ["Assets"], accountsPayable: ["TradeAndOtherCurrentPayablesToTradeSuppliers", "AccountsPayableCurrent"], totalCurrentLiabilities: ["CurrentLiabilities", "LiabilitiesCurrent"],
    shortTermDebt: ["CurrentBorrowingsAndCurrentPortionOfNoncurrentBorrowings", "ShortTermBorrowings", "LongTermDebtCurrent"],
    longTermDebt: ["LongtermBorrowings", "LongTermDebtNoncurrent"], totalDebt: ["Borrowings", "LongTermDebtAndFinanceLeaseObligations"],
    totalLiabilities: ["Liabilities"], equityAndLiabilities: ["EquityAndLiabilities"], totalStockholdersEquity: ["Equity", "EquityAttributableToOwnersOfParent", "StockholdersEquity", "StockholdersEquityIncludingPortionAttributableToNoncontrollingInterest"],
    sharesOutstanding: ["EntityCommonStockSharesOutstanding", "NumberOfSharesOutstanding"],
  },
  "cash-flow": {
    netIncome: ["ProfitLoss", "NetIncomeLoss"], depreciationAndAmortization: ["AdjustmentsForDepreciationAndAmortisationExpense", "DepreciationDepletionAndAmortization"],
    workingCapitalChanges: ["IncreaseDecreaseInWorkingCapital"],
    operatingCashFlow: ["CashFlowsFromUsedInOperatingActivities", "NetCashProvidedByUsedInOperatingActivities"],
    capitalExpenditure: ["PurchaseOfPropertyPlantAndEquipmentIntangibleAssetsOtherThanGoodwillInvestmentPropertyAndOtherNoncurrentAssets", "PaymentsToAcquirePropertyPlantAndEquipment", "PaymentsToAcquireProductiveAssets"],
    acquisitionsNet: ["CashFlowsUsedInObtainingControlOfSubsidiariesOrOtherBusinessesClassifiedAsInvestingActivities", "PaymentsToAcquireBusinessesNetOfCashAcquired", "PaymentsToAcquireBusinessTwoNetOfCashAcquired"],
    investingCashFlow: ["CashFlowsFromUsedInInvestingActivities", "NetCashProvidedByUsedInInvestingActivities"],
    debtFlows: ["IncreaseDecreaseThroughFinancingCashFlowsLiabilitiesArisingFromFinancingActivities"],
    commonStockRepurchased: ["PurchaseOfTreasuryShares", "PaymentsForRepurchaseOfCommonStock"],
    commonStockIssued: ["ProceedsFromIssuingShares", "ProceedsFromStockOptionsExercised"],
    commonStockDividendsPaid: ["DividendsPaidToEquityHoldersOfParentClassifiedAsFinancingActivities", "DividendsPaidOrdinaryShares", "DividendsPaid", "PaymentsOfDividendsCommonStock"],
    financingCashFlow: ["CashFlowsFromUsedInFinancingActivities", "NetCashProvidedByUsedInFinancingActivities"], stockBasedCompensation: ["ExpenseFromSharebasedPaymentTransactionsWithEmployees", "ShareBasedCompensation"],
  },
};

async function companyFacts(symbol: string) {
  const identity = await resolveSecIdentity(symbol);
  const raw = objectValue(await secGet(`/api/xbrl/companyfacts/CIK${identity.cik}.json`, "company-facts"));
  const namespaces = objectValue(raw.facts);
  const selectedNamespaces = ["ifrs-full", "us-gaap", ...Object.keys(namespaces).filter((name) => !["dei", "ifrs-full", "us-gaap", "invest"].includes(name))];
  const facts: Record<string, unknown> = {};
  const namespaceByConcept: Record<string, string> = {};
  for (const namespace of selectedNamespaces) {
    for (const [concept, fact] of Object.entries(objectValue(namespaces[namespace]))) {
      if (!(concept in facts)) {
        facts[concept] = fact;
        namespaceByConcept[concept] = namespace;
      }
    }
  }
  // DEI contains period-end shares for many issuers and is safe to merge last.
  for (const [concept, fact] of Object.entries(objectValue(namespaces.dei))) {
    if (!(concept in facts)) { facts[concept] = fact; namespaceByConcept[concept] = "dei"; }
  }
  return { identity, raw, facts, namespaceByConcept };
}

function buildStatements(symbol: string, facts: Record<string, unknown>, namespaceByConcept: Record<string, string>, kind: StatementKind, period: StatementPeriod, limit: number) {
  const mapped = Object.entries(fieldsByKind[kind]).map(([field, tags]) => [field, observations(facts, tags)] as const);
  const annualForms = new Set(["10-K", "20-F", "40-F"]);
  const annualAnchorDates = new Set(observations(facts, fieldsByKind.income.revenue!).filter((row) => {
    if (!annualForms.has(row.form) || !row.start) return false;
    return (Date.parse(row.end) - Date.parse(row.start)) / 86_400_000 >= 300;
  }).map((row) => row.end));
  const dates = period === "annual"
    ? [...annualAnchorDates].sort().reverse().slice(0, limit)
    : [...new Set(mapped.flatMap(([, rows]) => rows.filter((row) => row.form === "10-Q").map((row) => row.end)))].sort().reverse().slice(0, limit);
  return dates.map((fiscalDate): FinancialStatement => {
    const values: Record<string, number | null> = {}; const lineage: FinancialStatement["lineage"] = {}; let acceptedAt: string | null = null; let currency: string | null = null;
    for (const [field, rows] of mapped) {
      const conceptPriority = fieldsByKind[kind][field] ?? [];
      const candidates = rows.filter((row) => row.end === fiscalDate && (period === "annual" ? annualForms.has(row.form) : row.form === "10-Q")).sort((a, b) => conceptPriority.indexOf(a.concept) - conceptPriority.indexOf(b.concept) || (b.filed ?? "").localeCompare(a.filed ?? ""));
      const selected = candidates[0]; values[field] = selected?.val ?? null;
      if (["capitalExpenditure", "acquisitionsNet", "commonStockRepurchased", "commonStockDividendsPaid"].includes(field) && values[field] !== null) values[field] = -Math.abs(values[field]!);
      if (selected?.filed && (acceptedAt === null || selected.filed.localeCompare(acceptedAt) > 0)) acceptedAt = selected.filed;
      if (selected && /^[A-Z]{3}$/.test(selected.unit)) currency ??= selected.unit;
      if (selected) lineage[field] = { field, provider: "sec-edgar", sourceTimestamp: selected.filed ?? fiscalDate, fetchedAt: new Date().toISOString(), quality: "verified", currency: /^[A-Z]{3}$/.test(selected.unit) ? selected.unit : null, unit: selected.unit, formula: null, inputs: [], sourceConcept: `${namespaceByConcept[selected.concept] ?? "unknown"}:${selected.concept}`, accessionNumber: selected.accessionNumber, sourceUrl: selected.accessionNumber ? `https://www.sec.gov/Archives/edgar/data/${Number(symbol.replace(/\D/g, "")) || ""}/${selected.accessionNumber.replaceAll("-", "")}/` : null };
    }
    const derived = (field: string, formula: string, inputs: string[], value: number) => {
      values[field] = value;
      lineage[field] = { field, provider: "calculated", sourceTimestamp: acceptedAt ?? fiscalDate, fetchedAt: new Date().toISOString(), quality: "verified", currency, unit: currency, formula, inputs };
    };
    if (kind === "income") {
      if (values.grossProfit === null && values.revenue !== null && values.costOfRevenue !== null) derived("grossProfit", "revenue - costOfRevenue", ["revenue", "costOfRevenue"], values.revenue! - values.costOfRevenue!);
      if (values.ebitda === null && values.operatingIncome !== null && values.depreciationAndAmortization !== null) derived("ebitda", "operatingIncome + depreciationAndAmortization", ["operatingIncome", "depreciationAndAmortization"], values.operatingIncome! + values.depreciationAndAmortization!);
    }
    if (kind === "balance-sheet") {
      if (values.totalDebt === null && (values.shortTermDebt !== null || values.longTermDebt !== null)) derived("totalDebt", "coalesce(shortTermDebt, 0) + coalesce(longTermDebt, 0)", ["shortTermDebt", "longTermDebt"], (values.shortTermDebt ?? 0) + (values.longTermDebt ?? 0));
      if (values.totalLiabilities === null && values.totalAssets !== null && values.totalStockholdersEquity !== null) derived("totalLiabilities", "totalAssets - totalStockholdersEquity", ["totalAssets", "totalStockholdersEquity"], values.totalAssets! - values.totalStockholdersEquity!);
    }
    if (kind === "cash-flow" && values.operatingCashFlow !== null && values.capitalExpenditure !== null) derived("freeCashFlow", "operatingCashFlow - abs(capitalExpenditure)", ["operatingCashFlow", "capitalExpenditure"], values.operatingCashFlow! + values.capitalExpenditure!);
    return { symbol, kind, period, fiscalDate, reportedCurrency: currency, acceptedAt, values, lineage };
  });
}

export class SecEdgarFundamentalsAdapter implements FundamentalsProvider {
  readonly name = "sec-edgar" as const;
  isConfigured() { return Boolean(process.env.SEC_USER_AGENT); }
  supportsSymbol(symbol: string) { return /^(?:CIK)?\d{1,10}$/.test(symbol) || (/^[A-Z][A-Z0-9.-]{0,14}$/.test(symbol) && !symbol.includes("=") && !symbol.startsWith("^") && !symbol.endsWith("-USD") && !/\.[A-Z]{2,4}$/.test(symbol)); }

  async getCompanyProfile(symbol: string) {
    const identity = await resolveSecIdentity(symbol); const raw = objectValue(await secGet(`/submissions/CIK${identity.cik}.json`, "submissions"));
    const data: MarketProfileDto = { symbol, name: textValue(raw, "name") ?? identity.title, exchange: arrayValue(raw.exchanges).find((value): value is string => typeof value === "string") ?? "US", quoteType: "EQUITY", currency: "USD", country: textValue(objectValue(raw.addresses), "stateOrCountry"), sector: null, industry: textValue(raw, "sicDescription"), description: null, employees: null, website: textValue(raw, "website", "investorWebsite"), source: "sec-edgar" };
    return providerResult(this.name, data, { freshness: "cached", freshnessType: "END_OF_DAY" });
  }
  async getFundamentals(symbol: string) {
    const { facts } = await companyFacts(symbol); const latest = (tags: string[]) => observations(facts, tags).sort((a, b) => b.end.localeCompare(a.end) || tags.indexOf(a.concept) - tags.indexOf(b.concept) || (b.filed ?? "").localeCompare(a.filed ?? ""))[0]?.val ?? null;
    const revenue = latest(fieldsByKind.income.revenue!); const netIncome = latest(fieldsByKind.income.netIncome!); const equity = latest(fieldsByKind["balance-sheet"].totalStockholdersEquity!); const weightedShares = latest(fieldsByKind.income.weightedAverageShsOutDil!); const sharesOutstanding = latest(fieldsByKind["balance-sheet"].sharesOutstanding!); const operating = latest(fieldsByKind["cash-flow"].operatingCashFlow!); const capex = latest(fieldsByKind["cash-flow"].capitalExpenditure!);
    const data: MarketFundamentalsDto = { symbol, marketCap: null, enterpriseValue: null, trailingEps: netIncome !== null && weightedShares ? netIncome / weightedShares : null, trailingPe: null, forwardPe: null, priceToBook: null, dividendRate: null, dividendYield: null, returnOnEquity: netIncome !== null && equity ? netIncome / equity : null, debtToEquity: null, profitMargins: netIncome !== null && revenue ? netIncome / revenue : null, revenue, freeCashflow: operating !== null && capex !== null ? operating - Math.abs(capex) : null, sharesOutstanding, source: "sec-edgar" };
    return providerResult(this.name, data, { freshness: "cached", freshnessType: "END_OF_DAY", quality: revenue === null ? "partial" : "verified" });
  }
  async getStatements(symbol: string, kind: StatementKind, period: StatementPeriod, limit = 5) {
    const { facts, namespaceByConcept } = await companyFacts(symbol); const data = buildStatements(symbol, facts, namespaceByConcept, kind, period, limit);
    if (!data.length) throw new ProviderError(this.name, "NOT_FOUND", "Bilanci SEC non disponibili.", false, 404);
    return providerResult(this.name, data, { sourceTimestamp: data[0]?.acceptedAt ?? data[0]?.fiscalDate ?? null, freshness: "cached", freshnessType: "END_OF_DAY" });
  }
  async getRatios(symbol: string, period: StatementPeriod, limit = 5) { const result = await this.getFundamentals(symbol); const data: FundamentalRatios[] = [{ symbol, period, date: result.meta.sourceTimestamp, values: { returnOnEquity: result.data.returnOnEquity, profitMargin: result.data.profitMargins } }].slice(0, limit); return providerResult(this.name, data, { freshness: "cached", freshnessType: "END_OF_DAY" }); }
  async getAnalystConsensus(): Promise<never> { throw new ProviderError(this.name, "PLAN_RESTRICTED", "SEC non pubblica consensus analyst.", false, 501); }
  async getEarningsCalendar(): Promise<never> { throw new ProviderError(this.name, "PLAN_RESTRICTED", "SEC non è usata per il calendario earnings.", false, 501); }
  async getDividendCalendar(): Promise<never> { throw new ProviderError(this.name, "PLAN_RESTRICTED", "SEC non è usata per il calendario dividendi.", false, 501); }
  async getEconomicCalendar(): Promise<never> { throw new ProviderError(this.name, "PLAN_RESTRICTED", "SEC non pubblica calendario macro.", false, 501); }
}
