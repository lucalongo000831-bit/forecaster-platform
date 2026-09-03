import { describe, expect, it } from "vitest";
import type { MarketChartPoint } from "@/types";
import { evaluateTechnicalAlertBatch, evaluateTechnicalAlertCondition, parseTechnicalAlertParameters, TECHNICAL_ALERT_CONDITIONS } from "./alert-registry";

function rows(closes: number[]): MarketChartPoint[] {
  return closes.map((close, index) => ({ timestamp: new Date(Date.UTC(2025, 0, index + 1)).toISOString(), open: close, high: close + 1, low: close - 1, close, volume: 100 }));
}

describe("Technical alert typed registry", () => {
  it("covers every declared condition with a validator", () => {
    expect(new Set(TECHNICAL_ALERT_CONDITIONS).size).toBe(12);
    expect(() => parseTechnicalAlertParameters("TECH_PRICE_CROSS_LEVEL", { level: -1 })).toThrow();
    expect(parseTechnicalAlertParameters("TECH_PRICE_CROSS_LEVEL", { level: 100, direction: "UP" })).toEqual({ level: 100, direction: "UP" });
  });

  it("triggers cross-up once on the transition, never repeatedly", () => {
    const first = evaluateTechnicalAlertCondition("TECH_PRICE_CROSS_LEVEL", { level: 100, direction: "UP" }, rows([98, 99]), null);
    const transition = evaluateTechnicalAlertCondition("TECH_PRICE_CROSS_LEVEL", { level: 100, direction: "UP" }, rows([99, 101]), first.state);
    const repeated = evaluateTechnicalAlertCondition("TECH_PRICE_CROSS_LEVEL", { level: 100, direction: "UP" }, rows([101, 102]), transition.state);
    expect(first).toMatchObject({ triggered: false, state: "BELOW" });
    expect(transition).toMatchObject({ triggered: true, state: "ABOVE" });
    expect(repeated).toMatchObject({ triggered: false, state: "ABOVE" });
  });

  it("supports inverse transition and defers unavailable data without false alerts", () => {
    expect(evaluateTechnicalAlertCondition("TECH_PRICE_CROSS_LEVEL", { level: 100, direction: "DOWN" }, rows([101, 99]), "ABOVE")).toMatchObject({ triggered: true, state: "BELOW" });
    expect(evaluateTechnicalAlertCondition("TECH_RSI_CROSS", { threshold: 70, direction: "UP" }, rows([100]), "BELOW")).toMatchObject({ available: false, triggered: false, reason: "INSUFFICIENT_HISTORY" });
  });

  it("requires an existing prior state before event notification", () => {
    const initial = evaluateTechnicalAlertCondition("TECH_PRICE_ENTER_ZONE", { low: 99, high: 101 }, rows([98, 100]), null);
    const entered = evaluateTechnicalAlertCondition("TECH_PRICE_ENTER_ZONE", { low: 99, high: 101 }, rows([98, 100]), "OUTSIDE");
    expect(initial.triggered).toBe(false);
    expect(entered.triggered).toBe(true);
  });

  it("batches identical symbol/timeframe datasets and defers stale data", async () => {
    let calls = 0;
    const result = await evaluateTechnicalAlertBatch(Array.from({ length: 10 }, (_, index) => ({ id: String(index), condition: "TECH_PRICE_CROSS_LEVEL" as const, symbol: "NVDA", timeframe: "1h", parameters: { level: 100, direction: "UP" }, previousState: "BELOW" })), async () => { calls += 1; return { bars: rows([99, 101]), freshness: "NEAR_REALTIME" }; });
    expect(calls).toBe(1);
    expect(result.filter((item) => item.evaluation.triggered)).toHaveLength(10);
    const stale = await evaluateTechnicalAlertBatch([{ id: "stale", condition: "TECH_PRICE_CROSS_LEVEL", symbol: "NVDA", timeframe: "1h", parameters: { level: 100 }, previousState: "BELOW" }], async () => ({ bars: rows([99, 101]), freshness: "STALE" }));
    expect(stale[0].evaluation).toMatchObject({ available: false, triggered: false, reason: "FRESHNESS_STALE" });
  });
});
