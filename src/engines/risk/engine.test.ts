import { describe, expect, it } from "vitest";
import { analyzeRiskPlan } from "./engine";
import { targetTechnical } from "@/engines/targets/engine.test";

describe("risk planning engine", () => {
  it("computes long stops, R targets and bounded position size", () => {
    const result = analyzeRiskPlan({ symbol: "AAPL", side: "LONG", entryPrice: 100, horizon: "1m", riskProfile: "MODERATE", accountSize: 10_000, maximumRiskPercent: 1, technical: targetTechnical() });
    expect(result.suggestedStop).toBeLessThan(100);
    expect(result.target2).toBeGreaterThan(100);
    expect(result.riskRewardRatio).toBe(2);
    expect(result.positionSize).toBeGreaterThan(0);
  });

  it("mirrors the calculation for short positions", () => {
    const result = analyzeRiskPlan({ symbol: "AAPL", side: "SHORT", entryPrice: 100, horizon: "1m", riskProfile: "CONSERVATIVE", technical: targetTechnical() });
    expect(result.suggestedStop).toBeGreaterThan(100);
    expect(result.target1).toBeLessThan(100);
  });
});
