import { describe, expect, it } from "vitest";
import { composeCalendarAnalysis } from "./calendar-events";

describe("calendar event composition", () => {
  it("normalizes and sorts independent provider categories", () => {
    const result = composeCalendarAnalysis({ from: "2026-08-01", to: "2026-08-31", earnings: { provider: "fmp", data: [{ symbol: "AAPL", date: "2026-08-06", time: "amc", estimatedEps: 2, actualEps: null, estimatedRevenue: 100, actualRevenue: null, currency: "USD" }] }, dividends: null, macro: { provider: "fmp", data: [{ date: "2026-08-05T12:30:00Z", country: "US", event: "Payrolls", currency: "USD", previous: 100, estimate: 110, actual: null, impact: "High", unit: "K" }] } });
    expect(result.events.map((event) => event.type)).toEqual(["MACRO", "EARNINGS"]);
    expect(result.availability.DIVIDEND.status).toBe("SOURCE_UNAVAILABLE");
    expect(result.availability.DIVIDEND.count).toBeNull();
    expect(result.events[0].importance).toBe("HIGH");
    expect(result.coverage.implementedCategories).toContain("CENTRAL_BANK");
  });

  it("preserves event-specific earnings, dividend, macro and central-bank semantics", () => {
    const result = composeCalendarAnalysis({ from: "2026-08-01", to: "2026-08-31",
      earnings: { provider: "fmp", data: [{ symbol: "NVDA", date: "2026-08-19T20:00:00Z", time: "amc", estimatedEps: 1.2, actualEps: null, estimatedRevenue: 45_000_000_000, actualRevenue: null, currency: "USD" }] },
      dividends: { provider: "fmp", data: [{ symbol: "AAPL", date: "2026-08-10", recordDate: "2026-08-11", paymentDate: "2026-08-14", declarationDate: "2026-07-30", amount: .26, adjustedAmount: .26, yield: .42, frequency: "Quarterly", currency: "USD" }] },
      macro: { provider: "fred", data: [{ date: "2026-08-05T12:30:00Z", country: "US", event: "Nonfarm payrolls", currency: "USD", previous: 120, estimate: 110, actual: null, impact: "High", unit: "K" }, { date: "2026-08-20T18:00:00Z", country: "US", event: "FOMC interest rate decision", currency: "USD", previous: 4.5, estimate: 4.25, actual: null, impact: "High", unit: "%" }] },
    });
    const earnings = result.events.find((event) => event.type === "EARNINGS")!;
    const dividend = result.events.find((event) => event.type === "DIVIDEND")!;
    const macro = result.events.find((event) => event.type === "MACRO")!;
    expect(earnings.details.estimatedRevenue).toBe(45_000_000_000);
    expect(dividend.estimate).toBeNull();
    expect(dividend.details).not.toHaveProperty("estimatedEps");
    expect(dividend.details.exDate).toBe("2026-08-10");
    expect(macro.details.releaseStatus).toBe("PENDING");
    expect(result.events.some((event) => event.type === "CENTRAL_BANK")).toBe(true);
    expect(result.availability.MACRO.count).toBe(1);
    expect(result.availability.CENTRAL_BANK.count).toBe(1);
  });
});
