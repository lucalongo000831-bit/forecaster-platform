import type { AnalystConsensus, FinancialStatement, FundamentalRatios } from "@/providers";
import type { MarketFundamentalsDto } from "@/types";
import { clamp, mean, safeCagr } from "../shared/statistics";
import { FUNDAMENTAL_MODEL_VERSION, type FundamentalAnalysis, type FundamentalMetricSet } from "./types";

const aliases = {
  revenue: ["revenue", "totalRevenue"], grossProfit: ["grossProfit"], operatingIncome: ["operatingIncome"], pretaxIncome: ["pretaxIncome", "incomeBeforeTax"], taxExpense: ["taxExpense", "incomeTaxExpense"], netIncome: ["netIncome", "netIncomeCommonStockholders"], eps: ["eps", "epsDiluted"], ebitda: ["ebitda"],
  assets: ["totalAssets"], debt: ["totalDebt", "shortTermAndLongTermDebt"], netDebt: ["netDebt"], equity: ["totalStockholdersEquity", "totalEquity"], currentAssets: ["totalCurrentAssets"], currentLiabilities: ["totalCurrentLiabilities"], cash: ["cashAndCashEquivalents", "cashAndShortTermInvestments"], inventory: ["inventory"],
  operatingCashFlow: ["operatingCashFlow", "netCashProvidedByOperatingActivities"], capex: ["capitalExpenditure", "investmentsInPropertyPlantAndEquipment"], freeCashFlow: ["freeCashFlow"], stockBasedCompensation: ["stockBasedCompensation"], dividendsPaid: ["dividendsPaid", "commonStockDividendsPaid"], interestExpense: ["interestExpense"],
} as const;

export function statementValue(statement: FinancialStatement | undefined, fields: readonly string[]): number | null {
  if (!statement) return null;
  for (const field of fields) {
    const value = statement.values[field];
    if (typeof value === "number" && Number.isFinite(value)) return value;
  }
  return null;
}

function ratioValue(ratio: FundamentalRatios | undefined, fields: string[]): number | null {
  if (!ratio) return null;
  for (const field of fields) {
    const value = ratio.values[field];
    if (typeof value === "number" && Number.isFinite(value)) return value;
  }
  return null;
}

function divide(numerator: number | null, denominator: number | null): number | null {
  return numerator === null || denominator === null || denominator === 0 ? null : numerator / denominator;
}

function valuationMultiple(numerator: number | null, denominator: number | null): number | null {
  return numerator === null || denominator === null || numerator < 0 || denominator <= 0 ? null : numerator / denominator;
}

function growth(current: number | null, previous: number | null) { return divide(current === null || previous === null ? null : current - previous, previous === null ? null : Math.abs(previous)); }
function ordered<T extends { fiscalDate?: string; date?: string | null }>(values: T[]) { return [...values].sort((a, b) => (b.fiscalDate ?? b.date ?? "").localeCompare(a.fiscalDate ?? a.date ?? "")); }
function componentScore(values: Array<number | null>, map: (value: number) => number) {
  const scores = values.flatMap((value) => value === null ? [] : [clamp(map(value), 0, 100)]);
  return mean(scores);
}

export function analyzeFundamentals(input: {
  symbol: string;
  summary: MarketFundamentalsDto;
  income?: FinancialStatement[];
  balanceSheet?: FinancialStatement[];
  cashFlow?: FinancialStatement[];
  ratios?: FundamentalRatios[];
  analyst?: AnalystConsensus | null;
  source: string;
}): FundamentalAnalysis {
  const income = ordered(input.income ?? []); const balanceSheet = ordered(input.balanceSheet ?? []); const cashFlow = ordered(input.cashFlow ?? []); const ratios = ordered(input.ratios ?? []);
  const currentIncome = income[0]; const previousIncome = income[1]; const currentBalance = balanceSheet[0]; const previousBalance = balanceSheet[1]; const currentCashFlow = cashFlow[0]; const previousCashFlow = cashFlow[1]; const currentRatios = ratios[0];
  const revenue = statementValue(currentIncome, aliases.revenue); const previousRevenue = statementValue(previousIncome, aliases.revenue); const revenue3 = statementValue(income[3], aliases.revenue); const revenue5 = statementValue(income[5], aliases.revenue);
  const netIncome = statementValue(currentIncome, aliases.netIncome); const eps = statementValue(currentIncome, aliases.eps); const previousEps = statementValue(previousIncome, aliases.eps); const eps3 = statementValue(income[3], aliases.eps);
  const ebitda = statementValue(currentIncome, aliases.ebitda); const previousEbitda = statementValue(previousIncome, aliases.ebitda);
  const freeCashFlow = statementValue(currentCashFlow, aliases.freeCashFlow) ?? (statementValue(currentCashFlow, aliases.operatingCashFlow) !== null && statementValue(currentCashFlow, aliases.capex) !== null ? (statementValue(currentCashFlow, aliases.operatingCashFlow) as number) + (statementValue(currentCashFlow, aliases.capex) as number) : input.summary.freeCashflow);
  const previousFreeCashFlow = statementValue(previousCashFlow, aliases.freeCashFlow);
  const assets = statementValue(currentBalance, aliases.assets); const previousAssets = statementValue(previousBalance, aliases.assets); const averageAssets = assets !== null && previousAssets !== null ? (assets + previousAssets) / 2 : assets;
  const equity = statementValue(currentBalance, aliases.equity); const previousEquity = statementValue(previousBalance, aliases.equity); const averageEquity = equity !== null && previousEquity !== null ? (equity + previousEquity) / 2 : equity;
  const debt = statementValue(currentBalance, aliases.debt); const previousDebt = statementValue(previousBalance, aliases.debt); const cash = statementValue(currentBalance, aliases.cash); const previousCash = statementValue(previousBalance, aliases.cash); const netDebt = statementValue(currentBalance, aliases.netDebt) ?? (debt !== null && cash !== null ? debt - cash : null);
  const pretaxIncome = statementValue(currentIncome, aliases.pretaxIncome); const taxExpense = statementValue(currentIncome, aliases.taxExpense); const effectiveTaxRate = pretaxIncome !== null && pretaxIncome > 0 && taxExpense !== null ? clamp(taxExpense / pretaxIncome, 0, 0.5) : 0.25;
  const operatingIncome = statementValue(currentIncome, aliases.operatingIncome); const nopat = operatingIncome === null ? null : operatingIncome * (1 - effectiveTaxRate);
  const investedCapital = debt !== null && equity !== null && cash !== null ? debt + equity - cash : null;
  const previousInvestedCapital = previousDebt !== null && previousEquity !== null && previousCash !== null ? previousDebt + previousEquity - previousCash : null;
  const averageInvestedCapital = investedCapital !== null && previousInvestedCapital !== null ? (investedCapital + previousInvestedCapital) / 2 : investedCapital;
  const operatingCashFlow = statementValue(currentCashFlow, aliases.operatingCashFlow); const capex = statementValue(currentCashFlow, aliases.capex); const dividendsPaid = statementValue(currentCashFlow, aliases.dividendsPaid);
  const metrics: FundamentalMetricSet = {
    revenueGrowthYoY: growth(revenue, previousRevenue), revenueCagr3Y: safeCagr(revenue3, revenue, 3), revenueCagr5Y: safeCagr(revenue5, revenue, 5), epsGrowthYoY: growth(eps, previousEps), epsCagr3Y: safeCagr(eps3, eps, 3), freeCashFlowGrowthYoY: growth(freeCashFlow, previousFreeCashFlow), ebitdaGrowthYoY: growth(ebitda, previousEbitda),
    grossMargin: ratioValue(currentRatios, ["grossProfitMargin", "grossProfitMarginTTM"]) ?? divide(statementValue(currentIncome, aliases.grossProfit), revenue),
    operatingMargin: ratioValue(currentRatios, ["operatingProfitMargin", "operatingProfitMarginTTM"]) ?? divide(operatingIncome, revenue),
    ebitdaMargin: ratioValue(currentRatios, ["ebitdaMargin", "ebitdaMarginTTM"]) ?? divide(ebitda, revenue), netMargin: ratioValue(currentRatios, ["netProfitMargin", "netProfitMarginTTM"]) ?? divide(netIncome, revenue), freeCashFlowMargin: divide(freeCashFlow, revenue),
    returnOnEquity: ratioValue(currentRatios, ["returnOnEquity", "returnOnEquityTTM"]) ?? divide(netIncome, averageEquity) ?? input.summary.returnOnEquity, returnOnAssets: ratioValue(currentRatios, ["returnOnAssets", "returnOnAssetsTTM"]) ?? divide(netIncome, averageAssets), returnOnInvestedCapital: ratioValue(currentRatios, ["returnOnInvestedCapital", "returnOnInvestedCapitalTTM"]) ?? divide(nopat, averageInvestedCapital), assetTurnover: ratioValue(currentRatios, ["assetTurnover", "assetTurnoverTTM"]) ?? divide(revenue, averageAssets),
    debtToEquity: ratioValue(currentRatios, ["debtEquityRatio", "debtToEquityRatio", "debtToEquityRatioTTM"]) ?? divide(debt, equity) ?? input.summary.debtToEquity, debtToAssets: ratioValue(currentRatios, ["debtRatio", "debtToAssetsRatio"] ) ?? divide(debt, assets), netDebt, netDebtToEbitda: divide(netDebt, ebitda), interestCoverage: ratioValue(currentRatios, ["interestCoverage", "interestCoverageRatio"]), currentRatio: ratioValue(currentRatios, ["currentRatio", "currentRatioTTM"]) ?? divide(statementValue(currentBalance, aliases.currentAssets), statementValue(currentBalance, aliases.currentLiabilities)), quickRatio: ratioValue(currentRatios, ["quickRatio", "quickRatioTTM"]) ?? divide(statementValue(currentBalance, aliases.currentAssets) !== null && statementValue(currentBalance, aliases.inventory) !== null ? (statementValue(currentBalance, aliases.currentAssets) as number) - (statementValue(currentBalance, aliases.inventory) as number) : null, statementValue(currentBalance, aliases.currentLiabilities)),
    operatingCashFlow, capitalExpenditure: capex, freeCashFlow, cashConversion: divide(operatingCashFlow, netIncome), stockBasedCompensation: statementValue(currentCashFlow, aliases.stockBasedCompensation), dividendCoverage: divide(freeCashFlow, dividendsPaid === null ? null : Math.abs(dividendsPaid)),
    trailingPe: input.summary.trailingPe ?? valuationMultiple(input.summary.marketCap, netIncome), forwardPe: input.summary.forwardPe, peg: ratioValue(currentRatios, ["priceEarningsToGrowthRatio", "priceEarningsToGrowthRatioTTM"]), evToEbitda: ratioValue(currentRatios, ["enterpriseValueMultiple", "enterpriseValueMultipleTTM"]) ?? valuationMultiple(input.summary.enterpriseValue, ebitda), evToRevenue: valuationMultiple(input.summary.enterpriseValue, revenue), priceToSales: ratioValue(currentRatios, ["priceToSalesRatio", "priceToSalesRatioTTM"]) ?? valuationMultiple(input.summary.marketCap, revenue), priceToBook: input.summary.priceToBook ?? valuationMultiple(input.summary.marketCap, equity), priceToFreeCashFlow: valuationMultiple(input.summary.marketCap, freeCashFlow), earningsYield: divide(netIncome, input.summary.marketCap) ?? (input.summary.trailingPe && input.summary.trailingPe !== 0 ? 1 / input.summary.trailingPe : null), freeCashFlowYield: divide(freeCashFlow, input.summary.marketCap), dividendYield: input.summary.dividendYield,
  };
  const growthScore = componentScore([metrics.revenueGrowthYoY, metrics.revenueCagr3Y, metrics.revenueCagr5Y, metrics.epsGrowthYoY, metrics.freeCashFlowGrowthYoY, metrics.ebitdaGrowthYoY], (value) => 50 + value * 150);
  const profitabilityScore = componentScore([metrics.grossMargin, metrics.operatingMargin, metrics.netMargin, metrics.returnOnEquity, metrics.returnOnAssets, metrics.returnOnInvestedCapital], (value) => 40 + value * 120);
  const balanceSheetScore = mean([componentScore([metrics.debtToEquity], (value) => 85 - value * 25), componentScore([metrics.netDebtToEbitda], (value) => 80 - value * 12), componentScore([metrics.currentRatio, metrics.quickRatio], (value) => 35 + value * 25), componentScore([metrics.interestCoverage], (value) => 40 + value * 4)].flatMap((value) => value === null ? [] : [value]));
  const cashFlowScore = componentScore([metrics.freeCashFlowMargin, metrics.cashConversion, metrics.freeCashFlowGrowthYoY, metrics.dividendCoverage], (value) => 45 + value * 45);
  const valuationScore = mean([componentScore([metrics.trailingPe, metrics.forwardPe], (value) => 90 - value * 2), componentScore([metrics.evToEbitda], (value) => 90 - value * 3), componentScore([metrics.freeCashFlowYield, metrics.earningsYield, metrics.dividendYield], (value) => 40 + value * 500)].flatMap((value) => value === null ? [] : [value]));
  const qualityScore = mean([componentScore([metrics.cashConversion], (value) => 40 + value * 40), componentScore([metrics.freeCashFlowMargin, metrics.netMargin], (value) => 40 + value * 120), componentScore([metrics.debtToAssets], (value) => 90 - value * 100)].flatMap((value) => value === null ? [] : [value]));
  const componentScores = [growthScore, profitabilityScore, balanceSheetScore, cashFlowScore, valuationScore, qualityScore].filter((value): value is number => value !== null);
  const fundamentalScore = mean(componentScores);
  const entries = Object.entries(metrics); const available = entries.filter(([, value]) => value !== null); const dataCompleteness = available.length / entries.length * 100;
  const confidence = dataCompleteness >= 75 && income.length >= 4 ? "HIGH" : dataCompleteness >= 55 ? "MEDIUM" : dataCompleteness >= 30 ? "LOW" : "INSUFFICIENT";
  const reasons = [
    metrics.revenueGrowthYoY === null ? null : `Revenue YoY ${metrics.revenueGrowthYoY >= 0 ? "grew" : "contracted"} ${(Math.abs(metrics.revenueGrowthYoY) * 100).toFixed(1)}%.`,
    metrics.freeCashFlowMargin === null ? null : `Free-cash-flow margin is ${(metrics.freeCashFlowMargin * 100).toFixed(1)}%.`,
    metrics.debtToEquity === null ? null : `Debt/equity is ${metrics.debtToEquity.toFixed(2)}.`,
    metrics.trailingPe === null ? null : `Trailing P/E is ${metrics.trailingPe.toFixed(1)}x.`,
  ].filter((value): value is string => value !== null);
  return { symbol: input.symbol, calculatedAt: new Date().toISOString(), dataTimestamp: currentIncome?.acceptedAt ?? currentIncome?.fiscalDate ?? null, modelVersion: FUNDAMENTAL_MODEL_VERSION, fundamentalScore, growthScore, profitabilityScore, balanceSheetScore, cashFlowScore, valuationScore, qualityScore, dataCompleteness, confidence, reasons, metrics, usedFields: available.map(([field]) => field), source: input.source, inputs: { summary: input.summary, income, balanceSheet, cashFlow, ratios, analyst: input.analyst ?? null } };
}
