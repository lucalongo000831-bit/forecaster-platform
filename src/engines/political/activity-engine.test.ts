import { describe, expect, it } from "vitest";
import { PoliticalActivityEngine, filterPoliticalPeriod, politicalBreakdown, politicalTimeline } from "./activity-engine";
import { politicalTransaction } from "./test-fixtures";

const asOf = new Date("2025-02-01T12:00:00.000Z");

describe("PoliticalActivityEngine", () => {
  it("returns zero scores when no disclosure is available", () => { const result = new PoliticalActivityEngine().summarize([], "90D", [], asOf); expect(result.politicalActivityScore).toBe(0); expect(result.momentumScore).toBe(0); expect(result.direction).toBe("INSUFFICIENT_DATA"); });
  it("separates direction from activity intensity", () => { const rows = [politicalTransaction({ id: "a", politicianId: "p1", fingerprint: "a" }), politicalTransaction({ id: "b", politicianId: "p2", fingerprint: "b" })]; const result = new PoliticalActivityEngine().summarize(rows, "90D", [], asOf); expect(result.direction).toMatch(/BUYING/); expect(result.directionScore).toBeGreaterThan(0); expect(result.activityIntensityScore).toBeGreaterThan(0); });
  it("classifies balanced disclosure activity", () => { const rows = [politicalTransaction({ id: "a", fingerprint: "a", estimatedAmount: 10_000 }), politicalTransaction({ id: "b", fingerprint: "b", politicianId: "p2", transactionType: "SALE", estimatedAmount: 10_000 })]; expect(new PoliticalActivityEngine().summarize(rows, "90D", [], asOf).direction).toBe("BALANCED"); });
  it("counts unique politicians instead of repeated filings", () => { const rows = [politicalTransaction({ id: "a", fingerprint: "a" }), politicalTransaction({ id: "b", fingerprint: "b" })]; expect(new PoliticalActivityEngine().summarize(rows, "90D", [], asOf).uniquePoliticians).toBe(1); });
  it("keeps spouse ownership visible in aggregates", () => { const summary = new PoliticalActivityEngine().summarize([politicalTransaction({ ownerType: "SPOUSE" })], "90D", [], asOf); expect(summary.purchaseCount).toBe(1); expect(summary.estimatedPurchaseValue).toBe(8000.5); });
  it("excludes disclosures not known by the as-of date", () => { const rows = [politicalTransaction({ disclosureDate: "2025-02-02", marketAvailableDate: "2025-02-02" })]; expect(filterPoliticalPeriod(rows, "90D", asOf)).toHaveLength(0); });
  it("builds disclosure-date timeline points", () => { const points = politicalTimeline([politicalTransaction(), politicalTransaction({ id: "b", fingerprint: "b", transactionType: "SALE" })], "daily"); expect(points).toEqual([{ date: "2025-01-20", purchases: 1, sales: 1, estimatedActivity: 16001 }]); });
  it("ranks breakdowns by estimated disclosed activity", () => { const rows = [politicalTransaction(), politicalTransaction({ id: "b", fingerprint: "b", sector: "Energy", estimatedAmount: 50_000 })]; expect(politicalBreakdown(rows, (row) => row.sector ?? "UNKNOWN")[0]?.key).toBe("Energy"); });
});
