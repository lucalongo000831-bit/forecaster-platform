import type { AnalystConsensus, FinancialStatement, FundamentalRatios } from "@/providers";
import type { MarketFundamentalsDto } from "@/types";

export const FUNDAMENTAL_MODEL_VERSION = "fundamental-v1.0.0";

export interface FundamentalMetricSet {
  revenueGrowthYoY: number | null;
  revenueCagr3Y: number | null;
  revenueCagr5Y: number | null;
  epsGrowthYoY: number | null;
  epsCagr3Y: number | null;
  freeCashFlowGrowthYoY: number | null;
  ebitdaGrowthYoY: number | null;
  grossMargin: number | null;
  operatingMargin: number | null;
  ebitdaMargin: number | null;
  netMargin: number | null;
  freeCashFlowMargin: number | null;
  returnOnEquity: number | null;
  returnOnAssets: number | null;
  returnOnInvestedCapital: number | null;
  assetTurnover: number | null;
  debtToEquity: number | null;
  debtToAssets: number | null;
  netDebt: number | null;
  netDebtToEbitda: number | null;
  interestCoverage: number | null;
  currentRatio: number | null;
  quickRatio: number | null;
  operatingCashFlow: number | null;
  capitalExpenditure: number | null;
  freeCashFlow: number | null;
  cashConversion: number | null;
  stockBasedCompensation: number | null;
  dividendCoverage: number | null;
  trailingPe: number | null;
  forwardPe: number | null;
  peg: number | null;
  evToEbitda: number | null;
  evToRevenue: number | null;
  priceToSales: number | null;
  priceToBook: number | null;
  priceToFreeCashFlow: number | null;
  earningsYield: number | null;
  freeCashFlowYield: number | null;
  dividendYield: number | null;
}

export interface FundamentalAnalysis {
  symbol: string;
  calculatedAt: string;
  dataTimestamp: string | null;
  modelVersion: typeof FUNDAMENTAL_MODEL_VERSION;
  fundamentalScore: number | null;
  growthScore: number | null;
  profitabilityScore: number | null;
  balanceSheetScore: number | null;
  cashFlowScore: number | null;
  valuationScore: number | null;
  qualityScore: number | null;
  dataCompleteness: number;
  confidence: "INSUFFICIENT" | "LOW" | "MEDIUM" | "HIGH";
  reasons: string[];
  metrics: FundamentalMetricSet;
  usedFields: string[];
  source: string;
  inputs: {
    summary: MarketFundamentalsDto;
    income: FinancialStatement[];
    balanceSheet: FinancialStatement[];
    cashFlow: FinancialStatement[];
    ratios: FundamentalRatios[];
    analyst: AnalystConsensus | null;
  };
}
