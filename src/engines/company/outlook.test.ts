import { describe, expect, it } from "vitest";
import type { TechnicalAnalysis } from "@/engines/technical";
import { analyzeDailyOutlook, buildOperationalCalendar } from "./outlook";

describe("daily outlook and operational calendar", () => {
  it("labels closed-market output as next-session estimate", () => {
    const technical = { price: 100, score: 60, completeness: 80, volatility: { atr14: { value: 2 }, realized20: 0.2 }, structure: { support20: 95, resistance20: 105, swingLow: 94, swingHigh: 106 } } as unknown as TechnicalAnalysis;
    const result = analyzeDailyOutlook({ technical, marketState: "CLOSED", open: 99, high: 101, low: 98, previousClose: 99 });
    expect(result.marketPhase).toBe("CLOSED");
    expect(result.note).toContain("next-session");
    expect(result.expectedRange).toEqual([98, 102]);
    const calendar = buildOperationalCalendar({ start: new Date("2026-01-01T00:00:00Z"), days: 2, events: [], daily: result, orientation: "LONG" });
    expect(calendar).toHaveLength(2);
  });
});
