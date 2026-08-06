import { describe, expect, it } from "vitest";
import { runBacktest } from "./engine";

function bars() { return Array.from({ length: 700 }, (_, index) => { const close = 100 + index * 0.08 + Math.sin(index / 12) * 8; return { timestamp: new Date(Date.UTC(2023, 0, index + 1)).toISOString(), open: close * 0.999, high: close * 1.012, low: close * 0.988, close, adjustedClose: close, volume: 1_000_000 }; }); }
const configuration = { symbol: "AAPL", benchmark: "^GSPC", from: "2023-01-01", to: "2025-12-31", strategy: "TREND_MOMENTUM" as const, direction: "BOTH" as const, entryTiming: "NEXT_OPEN" as const, initialCapital: 10_000, stopPercent: 0.06, targetPercent: 0.12, trailingPercent: 0.08, maximumHoldingDays: 80, commission: 1, spreadBps: 2, slippageBps: 3, reinvest: true };

describe("backtest engine", () => {
  it("produces trades, costs and a finite equity curve without look-ahead entry", () => { const input = bars(); const result = runBacktest({ configuration, bars: input, benchmarkBars: input }); expect(result.equityCurve.length).toBeGreaterThan(400); expect(result.metrics.numberOfTrades).toBeGreaterThan(0); expect(result.trades.every((trade) => trade.costs >= 2)).toBe(true); expect(result.biasControls.some((item) => item.includes("previous close"))).toBe(true); });
  it("rejects an insufficient evaluation history", () => expect(() => runBacktest({ configuration, bars: bars().slice(0, 100) })).toThrow("INSUFFICIENT_BACKTEST_DATA"));
});
