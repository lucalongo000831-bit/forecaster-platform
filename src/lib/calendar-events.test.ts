import { describe, expect, it } from "vitest";
import { composeCalendarAnalysis } from "./calendar-events";

describe("calendar event composition", () => {
  it("normalizes and sorts independent provider categories", () => {
    const result = composeCalendarAnalysis({ from: "2026-08-01", to: "2026-08-31", earnings: { provider: "fmp", data: [{ symbol: "AAPL", date: "2026-08-06", time: "amc", estimatedEps: 2, actualEps: null, estimatedRevenue: 100, actualRevenue: null, currency: "USD" }] }, dividends: null, macro: { provider: "fmp", data: [{ date: "2026-08-05T12:30:00Z", country: "US", event: "Payrolls", currency: "USD", previous: 100, estimate: 110, actual: null, impact: "High", unit: "K" }] } });
    expect(result.events.map((event) => event.type)).toEqual(["MACRO", "EARNINGS"]);
    expect(result.availability.DIVIDEND.status).toBe("SOURCE_UNAVAILABLE");
    expect(result.availability.DIVIDEND.count).toBeNull();
    expect(result.events[0].importance).toBe("HIGH");
  });
});
