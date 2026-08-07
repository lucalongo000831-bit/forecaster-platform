import { describe, expect, it } from "vitest";
import type { FundamentalAnalysis } from "@/engines/fundamental";
import type { HistoricalCompanyPeriod } from "@/types";
import { buildCompanyValuation, calculateReverseDcf } from "./valuation";

describe("reverse DCF", () => {
  it("recovers bounded implied growth", () => {
    const result = calculateReverseDcf({ currentPrice: 100, shares: 10, netDebt: 0, freeCashFlow: 80, historicalFcfGrowth: 0.08 });
    expect(result.applicable).toBe(true);
    expect(result.impliedFcfGrowth).not.toBeNull();
    expect(result.explanation).toContain("appears to embed");
  });

  it("refuses missing or negative cash flow", () => {
    expect(calculateReverseDcf({ currentPrice: 100, shares: 10, netDebt: 0, freeCashFlow: -1, historicalFcfGrowth: null }).classification).toBe("UNAVAILABLE");
    expect(calculateReverseDcf({ currentPrice: 100, shares: null, netDebt: 0, freeCashFlow: 20, historicalFcfGrowth: null }).impliedFcfGrowth).toBeNull();
  });

  it("calculates margin of safety from prudent fair value", () => {
    const fundamental = { metrics: { freeCashFlow: 100, netDebt: 0, freeCashFlowGrowthYoY: 0.05, revenueCagr5Y: 0.05, operatingMargin: 0.2, trailingPe: 15, forwardPe: 14, evToEbitda: null, evToRevenue: null, priceToSales: null, priceToBook: null, priceToFreeCashFlow: null, freeCashFlowYield: null, earningsYield: null, dividendYield: null, peg: null }, inputs: { summary: { sharesOutstanding: 10, trailingEps: 5, trailingPe: 15, forwardPe: 14 } }, source: "test" } as unknown as FundamentalAnalysis;
    const history = [{ freeCashFlow: 100, dilutedShares: 10, netDebt: 0 } as HistoricalCompanyPeriod];
    const result = buildCompanyValuation({ currentPrice: 50, fundamental, historical: history, analyst: null, qualityScore: 80 });
    expect(result?.scenarios).toHaveLength(3);
    expect(result?.marginOfSafety).toBeCloseTo(((result?.prudentFairValue as number) - 50) / (result?.prudentFairValue as number));
    expect(result?.operationalPrices.avoid?.[0]).toBeGreaterThan(result?.fairValue as number);
  });
});
