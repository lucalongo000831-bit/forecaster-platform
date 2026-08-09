import { describe, expect, it } from "vitest";
import { normalizeFinancialStatements, reconcileFinancialPeriods } from "./statement-normalizer";

const statement = (kind: "income" | "balance-sheet" | "cash-flow", values: Record<string, number | null>) => ({ symbol: "TEST", kind, period: "annual" as const, fiscalDate: "2025-12-31", reportedCurrency: "USD", acceptedAt: "2026-02-01", values });

describe("financial statement normalization", () => {
  it("derives free cash flow with explicit provenance", () => {
    const [period] = normalizeFinancialStatements({ income: [statement("income", { revenue: 100 })], balance: [], cashFlow: [statement("cash-flow", { operatingCashFlow: 30, capitalExpenditure: -8 })], provider: "sec-edgar" });
    expect(period?.freeCashFlow).toBe(22);
    expect(period?.provenance.freeCashFlow?.provider).toBe("calculated");
  });
  it("surfaces material provider conflicts", () => {
    const first = normalizeFinancialStatements({ income: [statement("income", { revenue: 100 })], balance: [], cashFlow: [], provider: "fmp" });
    const second = normalizeFinancialStatements({ income: [statement("income", { revenue: 80 })], balance: [], cashFlow: [], provider: "sec-edgar" });
    expect(reconcileFinancialPeriods(first, second)).toHaveLength(1);
  });
});
