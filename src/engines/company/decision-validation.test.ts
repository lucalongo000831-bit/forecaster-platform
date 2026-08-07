import { describe, expect, it } from "vitest";
import type { MarketChartPoint } from "@/types";
import { validateCompanyDecisions, type CompanyDecisionSnapshot } from "./decision-validation";

function bars(length = 320): MarketChartPoint[] {
  return Array.from({ length }, (_, index) => {
    const close = 100 + index;
    return { timestamp: new Date(Date.UTC(2024, 0, index + 2)).toISOString(), open: close - 0.5, high: close + 1, low: close - 1, close, volume: 1_000 };
  });
}

function snapshots(count: number, verdict: CompanyDecisionSnapshot["verdict"] = "BUY"): CompanyDecisionSnapshot[] {
  return Array.from({ length: count }, (_, index) => ({ id: String(index), asOf: new Date(Date.UTC(2024, 0, index + 1)).toISOString(), verdict, referencePrice: 99 + index, modelVersion: "test" }));
}

describe("company decision validation", () => {
  it("uses only bars strictly after the immutable snapshot", () => {
    const result = validateCompanyDecisions({ symbol: "TEST", snapshots: snapshots(1), bars: bars(), now: "2025-01-01T00:00:00.000Z" });
    const oneWeek = result.outcomes.find((outcome) => outcome.horizon === "1W");
    expect(oneWeek?.exitAt).toBe(new Date(Date.UTC(2024, 0, 6)).toISOString());
    expect(oneWeek?.exitPrice).toBe(104);
    expect(result.biasControls.some((control) => control.includes("strictly after"))).toBe(true);
  });

  it("does not publish reliability metrics for a small sample", () => {
    const result = validateCompanyDecisions({ symbol: "TEST", snapshots: snapshots(4), bars: bars() });
    const bucket = result.buckets.find((item) => item.verdict === "BUY" && item.horizon === "1M");
    expect(bucket).toMatchObject({ observations: 4, statisticallyReliable: false, hitRate: null, stability: "INSUFFICIENT" });
  });

  it("reports validated long and short outcomes once the sample is sufficient", () => {
    const result = validateCompanyDecisions({ symbol: "TEST", snapshots: [...snapshots(10, "BUY"), ...snapshots(10, "SHORT").map((item, index) => ({ ...item, id: `short-${index}` }))], bars: bars() });
    expect(result.buckets.find((item) => item.verdict === "BUY" && item.horizon === "1W")?.hitRate).toBe(100);
    expect(result.buckets.find((item) => item.verdict === "SHORT" && item.horizon === "1W")?.hitRate).toBe(0);
  });
});
