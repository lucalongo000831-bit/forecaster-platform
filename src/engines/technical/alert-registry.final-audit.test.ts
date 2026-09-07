import { describe, expect, it } from "vitest";
import type { MarketChartPoint } from "@/types";
import { evaluateTechnicalAlertBatch, evaluateTechnicalAlertCondition, parseTechnicalAlertParameters, TECHNICAL_ALERT_CONDITIONS } from "./alert-registry";

function rows(closes: number[]): MarketChartPoint[] {
  return closes.map((close, index) => ({ timestamp: new Date(Date.UTC(2025, 0, index + 1)).toISOString(), open: close, high: close + 1, low: close - 1, close, volume: 100 }));
}

describe("Technical V3 independent alert audit", () => {
  it("validates all registered conditions without dynamic evaluation", () => {
    const valid: Record<(typeof TECHNICAL_ALERT_CONDITIONS)[number], object> = {
      TECH_PRICE_CROSS_LEVEL: { level: 100 }, TECH_PRICE_ENTER_ZONE: { low: 99, high: 101 }, TECH_PRICE_EXIT_ZONE: { low: 99, high: 101 },
      TECH_BOS_CONFIRMED: {}, TECH_CHOCH_CONFIRMED: {}, TECH_RSI_CROSS: { threshold: 70 }, TECH_MACD_CROSS_SIGNAL: {},
      TECH_DIVERGENCE_BULLISH: {}, TECH_DIVERGENCE_BEARISH: {}, TECH_PRICE_CROSS_EMA: { period: 20 },
      TECH_PRICE_CROSS_AVWAP: { anchorTimestamp: "2025-01-01T00:00:00.000Z" }, TECH_PRICE_CROSS_PROFILE: { boundary: "POC" },
    };
    for (const condition of TECHNICAL_ALERT_CONDITIONS) expect(parseTechnicalAlertParameters(condition, valid[condition])).toBeTruthy();
  });

  it("uses persisted state so an unchanged latest dataset cannot retrigger", () => {
    const data = rows([99, 101]);
    const first = evaluateTechnicalAlertCondition("TECH_PRICE_CROSS_LEVEL", { level: 100, direction: "UP" }, data, "BELOW");
    const second = evaluateTechnicalAlertCondition("TECH_PRICE_CROSS_LEVEL", { level: 100, direction: "UP" }, data, first.state);
    expect(first).toMatchObject({ triggered: true, state: "ABOVE" });
    expect(second).toMatchObject({ triggered: false, state: "ABOVE" });
  });

  it("notifies each zone transition only once and never on first observation", () => {
    const inside = rows([98, 100]);
    expect(evaluateTechnicalAlertCondition("TECH_PRICE_ENTER_ZONE", { low: 99, high: 101 }, inside, null).triggered).toBe(false);
    const entered = evaluateTechnicalAlertCondition("TECH_PRICE_ENTER_ZONE", { low: 99, high: 101 }, inside, "OUTSIDE");
    expect(entered.triggered).toBe(true);
    expect(evaluateTechnicalAlertCondition("TECH_PRICE_ENTER_ZONE", { low: 99, high: 101 }, inside, entered.state).triggered).toBe(false);
    expect(evaluateTechnicalAlertCondition("TECH_PRICE_EXIT_ZONE", { low: 99, high: 101 }, rows([100, 102]), "INSIDE").triggered).toBe(true);
  });

  it("deduplicates provider loads across users while isolating malformed configurations", async () => {
    let calls = 0;
    const items = Array.from({ length: 10 }, (_, index) => ({ id: `user-${index}`, condition: "TECH_PRICE_CROSS_LEVEL" as const, symbol: "nvda", timeframe: "1h", parameters: index === 9 ? { level: -1 } : { level: 100, direction: "UP" }, previousState: "BELOW" }));
    const result = await evaluateTechnicalAlertBatch(items, async () => { calls += 1; return { bars: rows([99, 101]), freshness: "DELAYED" }; });
    expect(calls).toBe(1);
    expect(result.slice(0, 9).every(({ evaluation }) => evaluation.triggered && evaluation.freshness === "DELAYED" && evaluation.message.includes("DELAYED"))).toBe(true);
    expect(result[9].evaluation).toMatchObject({ available: false, triggered: false, reason: "INVALID_CONFIGURATION", freshness: "DELAYED" });
  });

  it("defers stale/unavailable data and preserves the observed freshness classification", async () => {
    for (const freshness of ["STALE", "UNAVAILABLE"] as const) {
      const [result] = await evaluateTechnicalAlertBatch([{ id: freshness, condition: "TECH_PRICE_CROSS_LEVEL", symbol: "NVDA", timeframe: "1h", parameters: { level: 100 }, previousState: "BELOW" }], async () => ({ bars: rows([99, 101]), freshness }));
      expect(result.evaluation).toMatchObject({ available: false, triggered: false, state: "BELOW", freshness, reason: `FRESHNESS_${freshness}` });
    }
  });
});
