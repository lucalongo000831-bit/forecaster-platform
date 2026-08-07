import { describe, expect, it } from "vitest";
import type { FinancialStatement } from "@/providers";
import { buildHistoricalPeriods, validateCompanyData } from "./history";

function statement(kind: FinancialStatement["kind"], fiscalDate: string, values: Record<string, number | null>): FinancialStatement {
  return { symbol: "TEST", kind, period: "annual", fiscalDate, reportedCurrency: "USD", acceptedAt: fiscalDate, values };
}

describe("company statement history", () => {
  it("merges statement periods and preserves unavailable values as null", () => {
    const income = [statement("income", "2025-12-31", { revenue: 100, netIncome: 20, weightedAverageShsOutDil: 10 })];
    const balance = [statement("balance-sheet", "2025-12-31", { totalAssets: 200, totalLiabilities: 100, totalStockholdersEquity: 100, totalDebt: 40, cashAndCashEquivalents: 15 })];
    const cashFlow = [statement("cash-flow", "2025-12-31", { operatingCashFlow: 30, capitalExpenditure: -8 })];
    const periods = buildHistoricalPeriods({ income, balance, cashFlow });
    expect(periods[0].freeCashFlow).toBe(22);
    expect(periods[0].goodwill).toBeNull();
    expect(periods[0].netDebt).toBe(25);
    const quality = validateCompanyData({ income, balance, cashFlow, periods, dataTimestamp: new Date().toISOString() });
    expect(quality.checks.some((check) => check.code.startsWith("BALANCE_IDENTITY") && check.status === "PASS")).toBe(true);
    expect(quality.completeness).toBeGreaterThan(50);
  });

  it("does not synthesize periods when statements are absent", () => {
    const periods = buildHistoricalPeriods({ income: [], balance: [], cashFlow: [] });
    const quality = validateCompanyData({ income: [], balance: [], cashFlow: [], periods, dataTimestamp: null });
    expect(periods).toEqual([]);
    expect(quality.completeness).toBe(0);
    expect(quality.stale).toBe(true);
  });
});
