import { describe, expect, it } from "vitest";
import type { FundamentalAnalysis } from "@/engines/fundamental";
import type { HistoricalCompanyPeriod } from "@/types";
import { analyzeManagement, analyzeMoat, compareVerifiedPeers } from "./qualitative";

const row = (year: number, revenue: number, shares: number, debt: number): HistoricalCompanyPeriod => ({ fiscalDate: `${year}-12-31`, period: "annual", currency: "USD", revenue, grossProfit: null, ebitda: null, operatingIncome: null, netIncome: null, dilutedEps: null, dilutedShares: shares, cash: null, totalAssets: null, goodwill: null, intangibles: null, totalDebt: debt, netDebt: null, equity: null, workingCapital: null, operatingCashFlow: null, capitalExpenditure: null, freeCashFlow: revenue * 0.2, acquisitions: null, buybacks: null, shareIssuance: null, dividends: null, stockBasedCompensation: null, provider: "test" });

describe("qualitative evidence engines", () => {
  it("keeps unsupported moat categories uncertain", () => {
    const fundamental = { metrics: { operatingMargin: 0.28, returnOnInvestedCapital: 0.22 } } as FundamentalAnalysis;
    const moat = analyzeMoat(fundamental, [row(2025, 120, 10, 10), row(2024, 110, 10, 10), row(2023, 100, 10, 10)]);
    expect(moat.categories.find((item) => item.category === "brand")?.strength).toBe("UNCERTAIN");
    expect(moat.categories.find((item) => item.category === "cost advantage")?.quantitativeEvidence.length).toBeGreaterThan(0);
  });

  it("detects dilution and accepts only verified peers", () => {
    const management = analyzeManagement([row(2025, 120, 12, 15), row(2024, 100, 10, 10)]);
    expect(management.warnings.some((warning) => warning.includes("dilution"))).toBe(true);
    const peers = compareVerifiedPeers({ symbol: "A", name: "A", metrics: { pe: 10 }, provider: "test" }, [{ symbol: "B", name: "B", metrics: { pe: 12 }, provider: "test", verified: true }, { symbol: "C", name: "C", metrics: { pe: 8 }, provider: "test", verified: false }]);
    expect(peers.map((peer) => peer.symbol)).toEqual(["A", "B"]);
  });
});
