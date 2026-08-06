import { describe, expect, it } from "vitest";
import type { FinancialStatement, FundamentalRatios } from "@/providers";
import type { MarketFundamentalsDto } from "@/types";
import { analyzeFundamentals, statementValue } from "./engine";

function statement(kind: FinancialStatement["kind"], year: number, values: Record<string, number>): FinancialStatement {
  return { symbol: "ACME", kind, period: "annual", fiscalDate: `${year}-12-31`, reportedCurrency: "USD", acceptedAt: `${year + 1}-02-01T00:00:00.000Z`, values };
}

const summary: MarketFundamentalsDto = { symbol: "ACME", marketCap: 2_000, enterpriseValue: 2_200, trailingEps: 5, trailingPe: 20, forwardPe: 18, priceToBook: 3, dividendRate: 1, dividendYield: 0.02, returnOnEquity: 0.18, debtToEquity: 0.4, profitMargins: 0.12, revenue: 1_000, freeCashflow: 120, sharesOutstanding: 100, source: "fmp" };
const income = [2025, 2024, 2023, 2022, 2021, 2020].map((year, index) => statement("income", year, { revenue: 1_000 - index * 100, grossProfit: 500 - index * 40, operatingIncome: 220 - index * 15, netIncome: 130 - index * 10, eps: 5 - index * 0.3, ebitda: 260 - index * 15 }));
const balance = [statement("balance-sheet", 2025, { totalAssets: 1_500, totalDebt: 300, netDebt: 180, totalStockholdersEquity: 750, totalCurrentAssets: 500, totalCurrentLiabilities: 250, inventory: 50 })];
const cash = [statement("cash-flow", 2025, { operatingCashFlow: 180, capitalExpenditure: -60, freeCashFlow: 120, stockBasedCompensation: 20, dividendsPaid: -30 }), statement("cash-flow", 2024, { operatingCashFlow: 160, capitalExpenditure: -60, freeCashFlow: 100 })];
const ratios: FundamentalRatios[] = [{ symbol: "ACME", period: "FY", date: "2025-12-31", values: { currentRatio: 2, quickRatio: 1.8, returnOnAssets: 0.1, returnOnInvestedCapital: 0.15, interestCoverage: 10, priceToSalesRatio: 2 } }];

describe("fundamental engine", () => {
  it("reads only real statement fields", () => {
    expect(statementValue(income[0], ["revenue"])).toBe(1_000);
    expect(statementValue(income[0], ["missing"])).toBeNull();
  });

  it("calculates growth, margins and bounded component scores", () => {
    const result = analyzeFundamentals({ symbol: "ACME", summary, income, balanceSheet: balance, cashFlow: cash, ratios, source: "fmp" });
    expect(result.metrics.revenueGrowthYoY).toBeCloseTo(1_000 / 900 - 1);
    expect(result.metrics.freeCashFlowMargin).toBeCloseTo(0.12);
    expect(result.metrics.debtToAssets).toBeCloseTo(0.2);
    expect(result.fundamentalScore).toBeGreaterThanOrEqual(0);
    expect(result.fundamentalScore).toBeLessThanOrEqual(100);
    expect(result.modelVersion).toBe("fundamental-v1.0.0");
  });

  it("keeps unavailable metrics null instead of substituting zero", () => {
    const sparse = analyzeFundamentals({ symbol: "ACME", summary: { ...summary, marketCap: null, enterpriseValue: null, trailingPe: null, forwardPe: null, priceToBook: null, dividendYield: null, returnOnEquity: null, debtToEquity: null }, source: "yahoo" });
    expect(sparse.metrics.revenueGrowthYoY).toBeNull();
    expect(sparse.metrics.freeCashFlowYield).toBeNull();
    expect(sparse.confidence).toBe("INSUFFICIENT");
  });
});
