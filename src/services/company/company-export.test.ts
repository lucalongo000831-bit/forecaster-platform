import { describe, expect, it } from "vitest";
import type { CompanyIntelligenceReport } from "@/types";
import { companyMetricsCsv, companyReportPdf } from "./company-export";

const report = { symbol: "TEST", name: "Test Company", currency: "USD", currentPrice: 10, overallScore: null, verdict: "INSUFFICIENT_DATA", confidence: "VERY_LOW", quality: null, earningsQuality: null, moat: null, management: null, risks: null, valuation: null, thesis: { verdict: "INSUFFICIENT DATA", whyItMayWork: [], whyItMayFail: [], monitor: [] }, sources: [], limitations: ["Missing data"], modelVersion: "v1", scoringVersion: "v1", valuationVersion: "v1", signalVersion: "v1", reportVersion: "v1", dataTimestamp: null, calculatedAt: "2026-01-01T00:00:00.000Z" } as unknown as CompanyIntelligenceReport;

describe("company report export", () => {
  it("exports null values explicitly and creates a PDF signature", () => {
    expect(companyMetricsCsv(report)).toContain("overall_score,DATA NOT AVAILABLE");
    expect(new TextDecoder().decode(companyReportPdf(report)).startsWith("%PDF-1.4")).toBe(true);
  });

  it.each(["=1+1", "+1+1", "-1+1", "@SUM(1)", "\t=1+1", "\r=1+1", "  =1+1"])(
    "neutralizes formula-capable provider strings beginning with %j",
    (name) => {
      const csv = companyMetricsCsv({ ...report, name });
      const nameRow = csv.split("\n").find((row) => row.startsWith("name,"));
      expect(nameRow).toContain("'");
      expect(nameRow).not.toBe(`name,${name},FACT`);
    },
  );

  it("preserves legitimate negative numbers as numeric cells", () => {
    const csv = companyMetricsCsv({ ...report, currentPrice: -42.5, name: "-42.5" });
    expect(csv).toContain("price,-42.5,FACT");
    expect(csv).toContain("name,'-42.5,FACT");
  });
});
