import type { FinancialStatement } from "@/providers";
import type { CompanyConfidence, CompanyDataQuality, HistoricalCompanyPeriod } from "@/types";
import { clamp } from "@/engines/shared/statistics";

const fields = {
  revenue: ["revenue", "totalRevenue"], grossProfit: ["grossProfit"], ebitda: ["ebitda"], operatingIncome: ["operatingIncome"], netIncome: ["netIncome", "netIncomeCommonStockholders"], dilutedEps: ["epsDiluted", "eps"], dilutedShares: ["weightedAverageShsOutDil", "weightedAverageSharesDiluted"],
  cash: ["cashAndCashEquivalents", "cashAndShortTermInvestments"], assets: ["totalAssets"], liabilities: ["totalLiabilities"], goodwill: ["goodwill"], intangibles: ["intangibleAssets", "goodwillAndIntangibleAssets"], debt: ["totalDebt", "shortTermAndLongTermDebt"], netDebt: ["netDebt"], equity: ["totalStockholdersEquity", "totalEquity"], currentAssets: ["totalCurrentAssets"], currentLiabilities: ["totalCurrentLiabilities"],
  operatingCashFlow: ["operatingCashFlow", "netCashProvidedByOperatingActivities"], capex: ["capitalExpenditure", "investmentsInPropertyPlantAndEquipment"], freeCashFlow: ["freeCashFlow"], acquisitions: ["acquisitionsNet", "acquisitions"], buybacks: ["commonStockRepurchased", "repurchasesOfStock"], shareIssuance: ["commonStockIssued", "proceedsFromStockOptions"], dividends: ["commonStockDividendsPaid", "dividendsPaid"], stockBasedCompensation: ["stockBasedCompensation"],
} as const;

function value(statement: FinancialStatement | undefined, aliases: readonly string[]): number | null {
  if (!statement) return null;
  for (const alias of aliases) {
    const candidate = statement.values[alias];
    if (typeof candidate === "number" && Number.isFinite(candidate)) return candidate;
  }
  return null;
}

function confidence(completeness: number, years: number, hasWarnings: boolean): CompanyConfidence {
  if (completeness >= 85 && years >= 5 && !hasWarnings) return "VERY_HIGH";
  if (completeness >= 70 && years >= 5) return "HIGH";
  if (completeness >= 45 && years >= 3) return "MEDIUM";
  if (completeness >= 20) return "LOW";
  return "VERY_LOW";
}

export function buildHistoricalPeriods(input: { income: FinancialStatement[]; balance: FinancialStatement[]; cashFlow: FinancialStatement[] }): HistoricalCompanyPeriod[] {
  const byDate = new Map<string, { income?: FinancialStatement; balance?: FinancialStatement; cashFlow?: FinancialStatement }>();
  for (const [kind, statements] of [["income", input.income], ["balance", input.balance], ["cashFlow", input.cashFlow]] as const) {
    for (const statement of statements) {
      const key = `${statement.period}:${statement.fiscalDate}`;
      byDate.set(key, { ...byDate.get(key), [kind]: statement });
    }
  }
  return [...byDate.entries()].sort(([a], [b]) => b.localeCompare(a)).map(([, row]) => {
    const fiscalDate = row.income?.fiscalDate ?? row.balance?.fiscalDate ?? row.cashFlow?.fiscalDate ?? "";
    const operatingCashFlow = value(row.cashFlow, fields.operatingCashFlow);
    const capex = value(row.cashFlow, fields.capex);
    const totalDebt = value(row.balance, fields.debt);
    const cash = value(row.balance, fields.cash);
    const currentAssets = value(row.balance, fields.currentAssets);
    const currentLiabilities = value(row.balance, fields.currentLiabilities);
    return {
      fiscalDate,
      period: row.income?.period ?? row.balance?.period ?? row.cashFlow?.period ?? "annual",
      currency: row.income?.reportedCurrency ?? row.balance?.reportedCurrency ?? row.cashFlow?.reportedCurrency ?? null,
      revenue: value(row.income, fields.revenue), grossProfit: value(row.income, fields.grossProfit), ebitda: value(row.income, fields.ebitda), operatingIncome: value(row.income, fields.operatingIncome), netIncome: value(row.income, fields.netIncome), dilutedEps: value(row.income, fields.dilutedEps), dilutedShares: value(row.income, fields.dilutedShares),
      cash, totalAssets: value(row.balance, fields.assets), goodwill: value(row.balance, fields.goodwill), intangibles: value(row.balance, fields.intangibles), totalDebt, netDebt: value(row.balance, fields.netDebt) ?? (totalDebt !== null && cash !== null ? totalDebt - cash : null), equity: value(row.balance, fields.equity), workingCapital: currentAssets !== null && currentLiabilities !== null ? currentAssets - currentLiabilities : null,
      operatingCashFlow, capitalExpenditure: capex, freeCashFlow: value(row.cashFlow, fields.freeCashFlow) ?? (operatingCashFlow !== null && capex !== null ? operatingCashFlow + capex : null), acquisitions: value(row.cashFlow, fields.acquisitions), buybacks: value(row.cashFlow, fields.buybacks), shareIssuance: value(row.cashFlow, fields.shareIssuance), dividends: value(row.cashFlow, fields.dividends), stockBasedCompensation: value(row.cashFlow, fields.stockBasedCompensation),
      provider: row.income?.symbol ? "configured-fundamentals-provider" : "unavailable",
    };
  });
}

export function validateCompanyData(input: { income: FinancialStatement[]; balance: FinancialStatement[]; cashFlow: FinancialStatement[]; periods: HistoricalCompanyPeriod[]; dataTimestamp: string | null }): CompanyDataQuality {
  const checks: CompanyDataQuality["checks"] = [];
  const divergences: string[] = [];
  const allDates = [...input.income, ...input.balance, ...input.cashFlow].map((item) => `${item.kind}:${item.period}:${item.fiscalDate}`);
  const duplicates = allDates.length - new Set(allDates).size;
  checks.push({ code: "DUPLICATE_PERIODS", status: duplicates ? "WARN" : "PASS", message: duplicates ? `${duplicates} duplicate statement periods detected.` : "No duplicate statement periods." });
  for (const statement of input.balance) {
    const assets = value(statement, fields.assets); const liabilities = value(statement, fields.liabilities); const equity = value(statement, fields.equity);
    if (assets === null || liabilities === null || equity === null) continue;
    const tolerance = Math.max(Math.abs(assets) * 0.015, 1);
    const delta = Math.abs(assets - liabilities - equity);
    checks.push({ code: `BALANCE_IDENTITY_${statement.fiscalDate}`, status: delta <= tolerance ? "PASS" : "WARN", message: delta <= tolerance ? "Balance-sheet identity reconciles within tolerance." : "Assets differ materially from liabilities plus equity." });
  }
  const fieldsToCheck: Array<keyof HistoricalCompanyPeriod> = ["revenue", "netIncome", "dilutedShares", "totalAssets", "totalDebt", "operatingCashFlow", "capitalExpenditure", "freeCashFlow"];
  const total = input.periods.length * fieldsToCheck.length;
  const available = input.periods.reduce((sum, period) => sum + fieldsToCheck.filter((field) => typeof period[field] === "number").length, 0);
  const completeness = total ? available / total * 100 : 0;
  const missingFields = fieldsToCheck.filter((field) => !input.periods.some((period) => typeof period[field] === "number"));
  const timestampMs = input.dataTimestamp ? Date.parse(input.dataTimestamp) : Number.NaN;
  const stale = Number.isFinite(timestampMs) ? Date.now() - timestampMs > 550 * 86_400_000 : true;
  checks.push({ code: "FRESHNESS", status: stale ? "WARN" : "PASS", message: stale ? "Latest fundamental timestamp is stale or unavailable." : "Fundamental timestamp is current for annual reporting." });
  if (input.periods.some((period) => period.currency !== null) && new Set(input.periods.map((period) => period.currency).filter(Boolean)).size > 1) divergences.push("Multiple reporting currencies were found across statement periods.");
  const warningCount = checks.filter((check) => check.status !== "PASS").length;
  const score = clamp(completeness - warningCount * 6 - divergences.length * 8, 0, 100);
  return { score, confidence: confidence(completeness, input.periods.length, warningCount > 0 || divergences.length > 0), completeness, stale, checks, missingFields, divergences };
}
