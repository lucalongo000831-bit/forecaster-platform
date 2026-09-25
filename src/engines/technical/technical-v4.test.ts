import { describe, expect, it } from "vitest";
import type { MarketChartPoint } from "@/types";
import { calculateCrossAssetContext, calculatePositionPlan, calculateTechnicalConfluenceV4, calculateTechnicalStructureV4, filterTechnicalRange, isTechnicalRangeCompatible } from "./index";

function bars(count: number, start = Date.UTC(2010, 0, 1)): MarketChartPoint[] { return Array.from({ length: count }, (_, index) => { const close = 100 + index * .04 + Math.sin(index / 7) * 3; return { timestamp: new Date(start + index * 86_400_000).toISOString(), open: close - .4, high: close + 1, low: close - 1, close, volume: 1_000 + index * 3 }; }); }

describe("Technical V4 deterministic engines", () => {
  it("calculates long and short position plans without inventing missing values", () => {
    const long = calculatePositionPlan({ side: "LONG", entry: 100, stop: 95, targets: [110, 115, 120], accountSize: 10_000, riskPercent: 1, atr: 2.5, fractional: false });
    expect(long).toMatchObject({ status: "VALID", risk: 5, quantity: 20 }); expect(long.targets[0]?.riskReward).toBe(2);
    expect(calculatePositionPlan({ side: "SHORT", entry: 100, stop: 105, targets: [90, null, null], accountSize: 10_000, riskPercent: 1, atr: 2.5, fractional: true }).targets[0]?.riskReward).toBe(2);
    expect(calculatePositionPlan({ side: "LONG", entry: 100, stop: 105, targets: [], accountSize: null, riskPercent: null, atr: null, fractional: false }).status).toBe("INVALID");
  });
  it("uses only confirmed observations for structure and gives lifecycle timestamps", () => {
    const result = calculateTechnicalStructureV4(bars(220)); expect(result.status).toBe("AVAILABLE");
    expect(result.timeline.every((event) => event.availableAt >= event.timestamp)).toBe(true);
    expect(result.fairValueGaps.every((gap) => !gap.filledAt || gap.filledAt > gap.createdAt)).toBe(true);
  });
  it("aligns benchmark observations and reports insufficient overlap honestly", () => {
    const asset = bars(100); const benchmark = bars(100).map((bar, index) => ({ ...bar, close: 90 + index * .02 }));
    expect(calculateCrossAssetContext(asset, benchmark, "SPY")).toMatchObject({ status: "AVAILABLE", overlapStart: asset[0]!.timestamp });
    expect(calculateCrossAssetContext(asset.slice(0, 10), benchmark.slice(0, 10), "SPY").status).toBe("INSUFFICIENT_DATA");
  });
  it("labels confluence as descriptive rather than a probability", () => expect(calculateTechnicalConfluenceV4({ structure: null, advanced: null, divergences: null, crossAsset: null })).toMatchObject({ status: "PARTIAL", disclosure: "DESCRIPTIVE_NOT_PROBABILITY" }));
});

describe("Technical V4 historical ranges", () => {
  const fifteenYears = bars(15 * 365 + 4);
  it("MAX returns the entire available history and never truncates to one year", () => expect(filterTechnicalRange(fifteenYears, "MAX")).toHaveLength(fifteenYears.length));
  it("filters YTD and custom dates without future observations", () => { const now = new Date("2024-09-01T00:00:00Z"); const sample = bars(800, Date.UTC(2023, 0, 1)); expect(filterTechnicalRange(sample, "YTD", now)[0]?.timestamp.slice(0, 10)).toBe("2024-01-01"); expect(filterTechnicalRange(sample, "CUSTOM", now, { from: "2024-01-10", to: "2024-02-10" }).length).toBeGreaterThan(0); expect(filterTechnicalRange(sample, "CUSTOM", now, { from: "2024-10-01", to: "2024-11-01" })).toEqual([]); });
  it("makes compatibility explicit rather than silently changing an interval", () => { expect(isTechnicalRangeCompatible("1D", "5m")).toBe(true); expect(isTechnicalRangeCompatible("MAX", "1m")).toBe(false); expect(isTechnicalRangeCompatible("MAX", "1W")).toBe(true); });
});
