import type { FieldProvenance, FinancialStatement } from "@/providers";
import type { NormalizedFinancialPeriod } from "@/types";

const aliases = {
  revenue: ["revenue", "totalRevenue", "Revenue"], grossProfit: ["grossProfit", "GrossProfit"], operatingIncome: ["operatingIncome", "OperatingIncomeLoss"], netIncome: ["netIncome", "netIncomeCommonStockholders", "NetIncome"], ebitda: ["ebitda", "EBITDA"], dilutedShares: ["weightedAverageShsOutDil", "weightedAverageSharesDiluted"],
  cash: ["cashAndCashEquivalents", "cashAndShortTermInvestments"], totalAssets: ["totalAssets"], totalDebt: ["totalDebt", "shortTermAndLongTermDebt"], totalEquity: ["totalStockholdersEquity", "totalEquity"],
  operatingCashFlow: ["operatingCashFlow", "netCashProvidedByOperatingActivities"], capitalExpenditure: ["capitalExpenditure", "investmentsInPropertyPlantAndEquipment"], freeCashFlow: ["freeCashFlow"],
} as const;

function value(statement: FinancialStatement | undefined, keys: readonly string[]) {
  for (const key of keys) {
    const candidate = statement?.values[key];
    if (typeof candidate === "number" && Number.isFinite(candidate)) return candidate;
  }
  return null;
}

function lineage(field: string, provider: FieldProvenance["provider"], timestamp: string | null, currency: string | null, formula?: string, inputs?: string[]): FieldProvenance {
  return { field, provider, sourceTimestamp: timestamp, fetchedAt: new Date().toISOString(), quality: "verified", currency, unit: currency, formula: formula ?? null, inputs };
}

export function normalizeFinancialStatements(input: { income: FinancialStatement[]; balance: FinancialStatement[]; cashFlow: FinancialStatement[]; provider: FieldProvenance["provider"] }): NormalizedFinancialPeriod[] {
  const periods = new Map<string, { income?: FinancialStatement; balance?: FinancialStatement; cashFlow?: FinancialStatement }>();
  for (const [kind, statements] of [["income", input.income], ["balance", input.balance], ["cashFlow", input.cashFlow]] as const) for (const statement of statements) {
    const key = `${statement.period}:${statement.fiscalDate}`; periods.set(key, { ...periods.get(key), [kind]: statement });
  }
  return [...periods.values()].map((row) => {
    const source = row.income ?? row.balance ?? row.cashFlow!; const currency = source.reportedCurrency; const timestamp = source.acceptedAt ?? source.fiscalDate;
    const direct = {
      revenue: value(row.income, aliases.revenue), grossProfit: value(row.income, aliases.grossProfit), operatingIncome: value(row.income, aliases.operatingIncome), netIncome: value(row.income, aliases.netIncome), ebitda: value(row.income, aliases.ebitda), dilutedShares: value(row.income, aliases.dilutedShares),
      cash: value(row.balance, aliases.cash), totalAssets: value(row.balance, aliases.totalAssets), totalDebt: value(row.balance, aliases.totalDebt), totalEquity: value(row.balance, aliases.totalEquity), operatingCashFlow: value(row.cashFlow, aliases.operatingCashFlow), capitalExpenditure: value(row.cashFlow, aliases.capitalExpenditure), freeCashFlow: value(row.cashFlow, aliases.freeCashFlow),
    };
    const freeCashFlow = direct.freeCashFlow ?? (direct.operatingCashFlow !== null && direct.capitalExpenditure !== null ? direct.operatingCashFlow + (direct.capitalExpenditure > 0 ? -direct.capitalExpenditure : direct.capitalExpenditure) : null);
    const sourceForField = (field: string) => row.income?.lineage?.[field] ?? row.balance?.lineage?.[field] ?? row.cashFlow?.lineage?.[field] ?? lineage(field, input.provider, timestamp, currency);
    const provenance = Object.fromEntries(Object.keys(direct).map((field) => [field, sourceForField(field)]));
    if (direct.freeCashFlow === null && freeCashFlow !== null) provenance.freeCashFlow = lineage("freeCashFlow", "calculated", timestamp, currency, "operatingCashFlow - abs(capitalExpenditure)", ["operatingCashFlow", "capitalExpenditure"]);
    const period: NormalizedFinancialPeriod["period"] = source.period === "annual" ? "annual" : "quarter";
    return { period, fiscalDate: source.fiscalDate, filingDate: source.acceptedAt, currency, ...direct, freeCashFlow, provenance };
  }).sort((a, b) => b.fiscalDate.localeCompare(a.fiscalDate));
}

export interface FinancialConflict { field: string; fiscalDate: string; primary: number; comparison: number; relativeDifference: number; }
export function reconcileFinancialPeriods(primary: NormalizedFinancialPeriod[], comparison: NormalizedFinancialPeriod[], tolerance = 0.03) {
  const conflicts: FinancialConflict[] = [];
  const fields: Array<keyof Pick<NormalizedFinancialPeriod, "revenue" | "netIncome" | "totalAssets" | "totalDebt" | "operatingCashFlow" | "freeCashFlow">> = ["revenue", "netIncome", "totalAssets", "totalDebt", "operatingCashFlow", "freeCashFlow"];
  for (const period of primary) {
    const other = comparison.find((candidate) => candidate.period === period.period && candidate.fiscalDate === period.fiscalDate); if (!other || period.currency !== other.currency) continue;
    for (const field of fields) { const left = period[field]; const right = other[field]; if (left === null || right === null) continue; const denominator = Math.max(Math.abs(left), Math.abs(right), 1); const relativeDifference = Math.abs(left - right) / denominator; if (relativeDifference > tolerance) conflicts.push({ field, fiscalDate: period.fiscalDate, primary: left, comparison: right, relativeDifference }); }
  }
  return conflicts;
}
