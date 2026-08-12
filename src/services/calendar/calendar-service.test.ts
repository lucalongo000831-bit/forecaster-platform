import { describe, expect, it } from "vitest";
import type { CalendarEventType, MarketCalendarAnalysis } from "@/types";
import { mergeCalendarSources } from "./calendar-service";

const categories: CalendarEventType[] = ["EARNINGS", "DIVIDEND", "MACRO", "CENTRAL_BANK"];
function analysis(available: CalendarEventType[], persisted = false): MarketCalendarAnalysis {
  const availability = Object.fromEntries(categories.map((category) => [category, { status: available.includes(category) ? "AVAILABLE" : "SOURCE_UNAVAILABLE", provider: available.includes(category) ? "test" : null, reason: null, count: available.includes(category) ? 0 : null, lastUpdated: null, isLastKnownGood: persisted }])) as MarketCalendarAnalysis["availability"];
  return { from: "2026-08-01", to: "2026-08-31", monthLabel: "August 2026", events: [], availability, coverage: { implementedCategories: categories, availableCategories: available, categoryCoverage: Object.fromEntries(categories.map((category) => [category, available.includes(category) ? 100 : 0])) as Record<CalendarEventType, number>, overallCoverage: available.length / 4 * 100 }, persisted, calculatedAt: persisted ? "2026-08-12T10:00:00.000Z" : "2026-08-12T11:00:00.000Z" };
}

describe("calendar source merge", () => {
  it("preserves verified-empty corporate datasets while using persisted official categories", () => {
    const result = mergeCalendarSources(analysis(["EARNINGS", "DIVIDEND"]), analysis(["MACRO", "CENTRAL_BANK"], true), true);
    expect(result.coverage.overallCoverage).toBe(100);
    expect(result.availability.EARNINGS).toMatchObject({ status: "AVAILABLE", count: 0, isLastKnownGood: false });
    expect(result.availability.CENTRAL_BANK).toMatchObject({ status: "AVAILABLE", count: 0, isLastKnownGood: true });
  });

  it("does not let an unavailable live corporate source inherit a false verified zero", () => {
    const result = mergeCalendarSources(analysis([]), analysis(["MACRO", "CENTRAL_BANK"], true), true);
    expect(result.availability.EARNINGS.status).toBe("SOURCE_UNAVAILABLE");
    expect(result.coverage.overallCoverage).toBe(50);
  });

  it("retains stored events while restoring category availability from LKG", () => {
    const lkg = analysis(["EARNINGS", "DIVIDEND"], true);
    const persisted = analysis(["MACRO", "CENTRAL_BANK"], true);
    persisted.events = [{ id: "fed-1", type: "CENTRAL_BANK", title: "FOMC decision", date: "2026-08-20", time: "18:00", symbol: null, country: "US", importance: "HIGH", provider: "federal-reserve", estimate: null, actual: null, previous: null, unit: null, timezone: "UTC", company: null, currency: null, sourceTimestamp: null, details: { releaseStatus: "PENDING" } }];
    const result = mergeCalendarSources(lkg, persisted, true);
    expect(result.events).toHaveLength(1);
    expect(result.coverage.availableCategories).toEqual(categories);
  });
});
