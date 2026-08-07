import { describe, expect, it } from "vitest";
import type { HistoricalCompanyPeriod } from "@/types";
import { analyzeEarningsQuality } from "./earnings-quality";

const base: HistoricalCompanyPeriod = {
  fiscalDate: "2025-12-31", period: "annual", currency: "USD", revenue: 100, grossProfit: 60, ebitda: 30, operatingIncome: 25, netIncome: 20, dilutedEps: 2, dilutedShares: 10, cash: 20, totalAssets: 150, goodwill: 5, intangibles: 3, totalDebt: 20, netDebt: 0, equity: 80, workingCapital: 30, operatingCashFlow: 28, capitalExpenditure: -6, freeCashFlow: 22, acquisitions: null, buybacks: -2, shareIssuance: 0, dividends: -3, stockBasedCompensation: 2, provider: "test",
};

describe("earnings quality", () => {
  it("scores cash-backed earnings", () => {
    const result = analyzeEarningsQuality([base, { ...base, fiscalDate: "2024-12-31", netIncome: 18, operatingCashFlow: 24, dilutedShares: 10.1 }], 200);
    expect(result.score).toBeGreaterThan(60);
    expect(result.classification).not.toBe("NOT_ASSESSABLE");
    expect(result.fcfToNetIncome).toBeCloseTo(1.1);
  });

  it("flags dilution and weak conversion without replacing missing data", () => {
    const result = analyzeEarningsQuality([{ ...base, operatingCashFlow: 5, freeCashFlow: 3, dilutedShares: 12, stockBasedCompensation: 4 }, { ...base, fiscalDate: "2024-12-31", dilutedShares: 10 }], 200);
    expect(result.redFlags.length).toBeGreaterThanOrEqual(2);
    expect(result.dilutionRiskScore).toBeGreaterThan(50);
    expect(analyzeEarningsQuality([], null).score).toBeNull();
  });
});
