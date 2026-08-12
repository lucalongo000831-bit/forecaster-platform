import { describe, expect, it } from "vitest";
import { categoryContinuityReasons, effectiveComponentWeights, evaluateQualityGate, verifiedCount } from "./quality-gate";

describe("Kairo Data V2 quality gate", () => {
  it("rejects a suspicious empty provider response and preserves LKG eligibility", () => {
    expect(evaluateQualityGate({ previousRecordCount: 1_000, previousCoverage: 96, candidateRecordCount: 0, candidateCoverage: 0, sourceSucceeded: true, schemaValid: true })).toMatchObject({ accepted: false, suspiciousEmpty: true, reasons: expect.arrayContaining(["SUSPICIOUS_EMPTY_RESPONSE", "COVERAGE_DROP"]) });
  });

  it("allows an explicitly verified empty dataset", () => {
    expect(evaluateQualityGate({ previousRecordCount: 0, previousCoverage: 100, candidateRecordCount: 0, candidateCoverage: 100, sourceSucceeded: true, schemaValid: true, allowVerifiedEmpty: true })).toMatchObject({ accepted: true, status: "AVAILABLE" });
  });

  it("detects a category-specific collapse after a successful refresh", () => {
    expect(categoryContinuityReasons(
      { EARNINGS: 12, DIVIDEND: 4, MACRO: 8 },
      { EARNINGS: 0, DIVIDEND: 4, MACRO: 8 },
      new Set(["EARNINGS", "DIVIDEND", "MACRO"]),
    )).toEqual(["SUSPICIOUS_CATEGORY_COLLAPSE:EARNINGS"]);
  });

  it("distinguishes a verified zero from an unavailable value", () => {
    expect(verifiedCount(0, true)).toEqual({ value: 0, status: "AVAILABLE" });
    expect(verifiedCount(0, false)).toEqual({ value: null, status: "SOURCE_UNAVAILABLE" });
  });

  it("excludes never-seen components and renormalizes weights instead of scoring them as zero", () => {
    const weights = effectiveComponentWeights([{ key: "CREDIT", weight: .6, value: 70 }, { key: "ENERGY", weight: .4, value: null }]);
    expect(weights).toEqual([{ key: "CREDIT", weight: .6, value: 70, effectiveWeight: 1 }]);
  });
});
