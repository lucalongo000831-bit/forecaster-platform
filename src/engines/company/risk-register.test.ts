import { describe, expect, it } from "vitest";
import type { FundamentalAnalysis } from "@/engines/fundamental";
import type { TechnicalAnalysis } from "@/engines/technical";
import type { CompanyValuation } from "@/types";
import { buildCompanyRiskRegister } from "./risk-register";

describe("company risk register", () => {
  it("does not create a short thesis from valuation alone", () => {
    const valuation = { marginOfSafety: -0.5, reverseDcf: { classification: "VERY_AGGRESSIVE" } } as CompanyValuation;
    const result = buildCompanyRiskRegister({ fundamental: null, earnings: null, quality: null, valuation, technical: null, periods: [] });
    expect(result.shortEligible).toBe(false);
  });

  it("requires deterioration, negative momentum and aggressive expectations", () => {
    const fundamental = { metrics: { revenueGrowthYoY: -0.1, freeCashFlowGrowthYoY: -0.2, epsGrowthYoY: -0.1, netDebtToEbitda: 4 }, source: "test" } as FundamentalAnalysis;
    const technical = { score: 25, momentum: { rsi14: { value: 40 } }, volatility: { realized20: 0.3, maximumDrawdown: -0.5 } } as unknown as TechnicalAnalysis;
    const valuation = { marginOfSafety: -0.5, reverseDcf: { classification: "UNSUSTAINABLE" } } as CompanyValuation;
    const result = buildCompanyRiskRegister({ fundamental, earnings: null, quality: null, valuation, technical, periods: [] });
    expect(result.shortEligible).toBe(true);
    expect(result.redFlags.some((flag) => flag.code === "REVENUE_CONTRACTION")).toBe(true);
  });
});
