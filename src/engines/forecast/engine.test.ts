import { describe, expect, it } from "vitest";
import { analyzeForecast } from "./engine";
import { analyzeMarketRegime } from "@/engines/regime";
import { targetTechnical } from "@/engines/targets/engine.test";

function bars() { return Array.from({ length: 800 }, (_, index) => { const close = 100 * Math.exp(index * 0.0003 + Math.sin(index / 19) * 0.03); return { timestamp: new Date(Date.UTC(2023, 0, index + 1)).toISOString(), open: close * 0.998, high: close * 1.01, low: close * 0.99, close, adjustedClose: close, volume: 1_000_000 }; }); }

describe("probabilistic forecast engine", () => {
  it("returns ordered percentiles and deterministic probabilities", () => {
    const technical = targetTechnical();
    const input = { symbol: "AAPL", horizon: "1m" as const, currency: "USD", bars: bars(), technical, seasonality: null, regime: analyzeMarketRegime(technical), targetPrice: 140, stopPrice: 90, simulations: 1_200 };
    const first = analyzeForecast(input); const second = analyzeForecast(input);
    expect(first.percentiles.p5).toBeLessThan(first.percentiles.p50);
    expect(first.percentiles.p50).toBeLessThan(first.percentiles.p95);
    expect(first.percentiles).toEqual(second.percentiles);
    expect(first.probabilityAboveCurrentPrice).toBeGreaterThanOrEqual(0);
    expect(first.backtestCoverage.windows).toBeGreaterThan(0);
  });
});
