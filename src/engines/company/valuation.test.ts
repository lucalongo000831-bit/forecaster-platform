import { describe, expect, it } from "vitest";
import { calculateReverseDcf } from "./valuation";

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
});
