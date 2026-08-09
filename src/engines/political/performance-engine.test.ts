import { describe, expect, it } from "vitest";
import type { MarketChartPoint } from "@/types";
import { disclosuresKnownBy, PoliticalTradePerformanceEngine } from "./performance-engine";
import { politicalTransaction } from "./test-fixtures";

const points = (start = 100): MarketChartPoint[] => Array.from({ length: 140 }, (_, index) => { const date = new Date(Date.UTC(2025, 0, 1 + index)).toISOString(); const close = start + index; return { timestamp: date, open: close, high: close, low: close, close, adjustedClose: close, volume: 1_000 }; });

describe("PoliticalTradePerformanceEngine look-ahead protection", () => {
  it("enters only on or after public disclosure date", () => { const trade = politicalTransaction({ transactionDate: "2025-01-01", disclosureDate: "2025-01-20", marketAvailableDate: "2025-01-20" }); const result = new PoliticalTradePerformanceEngine().calculate(trade, points(), points(200)); expect(result.entryPrice).toBe(119); expect(result.marketAvailableDate).toBe("2025-01-20"); });
  it("never exposes a January 1 trade before its January 20 filing", () => { const row = politicalTransaction(); expect(disclosuresKnownBy([row], "2025-01-19")).toHaveLength(0); expect(disclosuresKnownBy([row], "2025-01-20")).toHaveLength(1); });
  it("computes benchmark-relative returns", () => { const result = new PoliticalTradePerformanceEngine().calculate(politicalTransaction(), points(), points(200)); expect(result.relativeReturns["20D"]).not.toBeNull(); expect(result.returns["1D"]).toBeCloseTo((120 / 119 - 1) * 100); });
  it("returns insufficient history instead of inventing performance", () => { const result = new PoliticalTradePerformanceEngine().calculate(politicalTransaction({ disclosureDate: "2030-01-01", marketAvailableDate: "2030-01-01" }), points(), points()); expect(result.classification).toBe("INSUFFICIENT_HISTORY"); expect(result.entryPrice).toBeNull(); });
  it("reports sample size and confidence explicitly", () => { const engine = new PoliticalTradePerformanceEngine(); const trade = politicalTransaction(); const performance = engine.calculate(trade, points(), points(200)); const [study] = engine.historicalStudy([trade], [performance]); expect(study?.sampleSize).toBe(1); expect(study?.confidence).toBe("VERY_LOW"); });
});
