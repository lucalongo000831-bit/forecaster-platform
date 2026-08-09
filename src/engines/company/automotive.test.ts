import { describe, expect, it } from "vitest";
import type { HistoricalCompanyPeriod } from "@/types";
import type { OfficialAutomotiveMetrics } from "@/providers/official/document-adapter";
import { analyzeAutomotiveMetrics } from "./automotive";

const row = (year: number, revenue: number, inventory: number, fcf: number): HistoricalCompanyPeriod => ({ fiscalDate: `${year}-12-31`, period: "annual", currency: "EUR", revenue, costOfRevenue: revenue * 0.8, grossProfit: revenue * 0.2, ebitda: revenue * 0.1, operatingIncome: revenue * 0.06, netIncome: revenue * 0.04, dilutedEps: 1, dilutedShares: 100, cash: 20, totalAssets: revenue * 1.2, goodwill: null, intangibles: null, totalDebt: 30, netDebt: 10, equity: 50, workingCapital: 5, inventory, operatingCashFlow: fcf + 10, capitalExpenditure: -10, freeCashFlow: fcf, acquisitions: null, buybacks: null, shareIssuance: null, dividends: null, stockBasedCompensation: null, provider: "test" });

describe("automotive metrics", () => {
  it("keeps industrial and consolidated cash metrics separate", () => {
    const official = { period: "2025", currency: "EUR", adjustedOperatingIncome: 6, priorAdjustedOperatingIncome: 8, industrialFreeCashFlow: 4, priorIndustrialFreeCashFlow: 5, industrialNetFinancialPosition: 7, priorIndustrialNetFinancialPosition: 8, consolidatedShipments: 5_000_000, priorConsolidatedShipments: 4_800_000, segments: [], brandPortfolio: [], centralizedDesignAndManufacturing: false, dealerFinanceOffering: false, document: { issuerId: "1", documentType: "ANNUAL_REPORT", period: "2025", publicationDate: "2026-02-01", sourceUrl: "https://www.sec.gov/Archives/edgar/data/1/a.htm", filingFormat: "IXBRL", language: "en", hash: "x", processedAt: "2026-02-01" } } satisfies OfficialAutomotiveMetrics;
    const result = analyzeAutomotiveMetrics({ history: [row(2025, 100, 20, 3), row(2024, 95, 18, 6), row(2023, 90, 17, 5)], official });
    expect(result.industrialFreeCashFlow).toBe(4);
    expect(result.consolidatedFreeCashFlow).toBe(3);
    expect(result.industrialNetFinancialPosition).toBe(7);
    expect(result.consolidatedNetDebt).toBe(10);
    expect(result.inventoryDays).toBeCloseTo(91.25);
  });
});
