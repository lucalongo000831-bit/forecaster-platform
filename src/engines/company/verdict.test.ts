import { describe, expect, it } from "vitest";
import { decideCompany } from "./verdict";

describe("company verdict matrix", () => {
  it("does not issue buy when data is insufficient", () => expect(decideCompany({ score: 90, qualityScore: 90, marginOfSafety: 0.5, riskScore: 20, shortEligible: false, dataCompleteness: 30 }).verdict).toBe("INSUFFICIENT_DATA"));
  it("requires an eligible short thesis", () => expect(decideCompany({ score: 20, qualityScore: 20, marginOfSafety: -0.5, riskScore: 90, shortEligible: false, dataCompleteness: 90 }).verdict).not.toBe("SHORT"));
});
