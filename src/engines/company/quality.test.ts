import { describe, expect, it } from "vitest";
import type { FundamentalAnalysis } from "@/engines/fundamental";
import type { HistoricalCompanyPeriod } from "@/types";
import { analyzeCompanyQuality } from "./quality";

const fundamental = { growthScore: 75, profitabilityScore: 80, balanceSheetScore: 70, cashFlowScore: 78, metrics: { returnOnInvestedCapital: 0.2, returnOnAssets: 0.14, returnOnEquity: 0.4, debtToEquity: 0.4 } } as FundamentalAnalysis;
const period = (year: number, revenue: number): HistoricalCompanyPeriod => ({ fiscalDate: `${year}-12-31`, period: "annual", currency: "USD", revenue, grossProfit: null, ebitda: null, operatingIncome: null, netIncome: null, dilutedEps: null, dilutedShares: null, cash: null, totalAssets: null, goodwill: null, intangibles: null, totalDebt: null, netDebt: null, equity: null, workingCapital: null, operatingCashFlow: null, capitalExpenditure: null, freeCashFlow: null, acquisitions: null, buybacks: null, shareIssuance: null, dividends: null, stockBasedCompensation: null, provider: "test" });

describe("company quality", () => {
  it("scores only available evidence and records missing qualitative inputs", () => {
    const result = analyzeCompanyQuality({ fundamental, earningsQuality: null, periods: [period(2025, 120), period(2024, 110), period(2023, 100), period(2022, 91)] });
    expect(result.totalScore).toBeGreaterThan(60);
    expect(result.moat.score).toBeNull();
    expect(result.moat.missing.length).toBe(1);
    expect(result.confidence).not.toBe("HIGH");
  });

  it("does not create a neutral score from absent data", () => {
    const result = analyzeCompanyQuality({ fundamental: null, earningsQuality: null, periods: [] });
    expect(result.totalScore).toBeNull();
    expect(result.confidence).toBe("VERY_LOW");
  });
});
