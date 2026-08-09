import { describe, expect, it } from "vitest";
import { calculateCompanyCoverage } from "./coverage";

describe("company coverage v2", () => {
  it("does not count missing or insufficient evidence as covered", () => {
    const result = calculateCompanyCoverage({ instrument: null, quote: null, history: [], fundamental: null, valuation: null, analyst: null, peers: [], management: null, moat: null, automotive: null, risks: null, seasonality: [], dataQuality: { score: 0, confidence: "VERY_LOW", completeness: 0, stale: true, checks: [], missingFields: [], divergences: [] }, insiders: [], dividends: [], ownership: null, technicalAvailable: false, forecastAvailable: false });
    expect(result.applicableDataCoverage).toBe(0);
    expect(result.missingFields).toContain("Identity.canonicalIssuer");
    expect(result.fields.find((item) => item.field === "Management.credibilityScore")?.status).toBe("INSUFFICIENT_EVIDENCE");
  });
});
