import { describe, expect, it } from "vitest";
import { adaptTimePoints, normalizeChartTime, timeKey } from "./chart-data-adapter";
import { formatKairoPercent, formatKairoPrice } from "./chart-formatters";

describe("Kairo chart data adapter", () => {
  it("sorts ascending, deduplicates timestamps and keeps the latest duplicate", () => {
    const result = adaptTimePoints([
      { timestamp: "2026-08-03T20:00:00Z", value: 3 },
      { timestamp: "2026-08-01T20:00:00Z", value: 1 },
      { timestamp: "2026-08-03T20:00:00Z", value: 4 },
    ]);
    expect(result.data.map((point) => point.value)).toEqual([1, 4]);
  });

  it("rejects null, NaN and Infinity without substituting zero", () => {
    const result = adaptTimePoints([
      { label: "2026-08-01", value: null },
      { label: "2026-08-02", value: Number.NaN },
      { label: "2026-08-03", value: Number.POSITIVE_INFINITY },
      { label: "2026-08-04", value: -2 },
    ]);
    expect(result.rejected).toBe(3);
    expect(result.data).toHaveLength(1);
    expect(result.data[0]?.value).toBe(-2);
  });

  it("preserves equity business dates and crypto weekend dates", () => {
    expect(normalizeChartTime("2026-08-21")).toBe("2026-08-21");
    expect(normalizeChartTime("2026-08-22")).toBe("2026-08-22");
    expect(timeKey(normalizeChartTime("2026-08-22")!)).toBe("2026-08-22");
  });

  it("normalizes intraday timestamps without timezone day shifts", () => {
    expect(normalizeChartTime("2026-08-21T20:00:00.000Z")).toBe(1787342400);
  });

  it("formats percentage and low-priced assets precisely", () => {
    expect(formatKairoPercent(0.12)).toBe("+0.12%");
    expect(formatKairoPercent(0.12, "decimal")).toBe("+12.00%");
    expect(formatKairoPrice(0.004321)).toContain("0.004321");
  });
});
