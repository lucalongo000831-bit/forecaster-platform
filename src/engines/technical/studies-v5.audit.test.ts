import { describe, expect, it } from "vitest";
import { simpleMovingAverage, exponentialMovingAverage } from "./indicators";
import { atrTrailingStop, directionalMovement, donchianChannels, movingAverageOnVisibleHistory, smoothedMovingAverage, supertrend } from "./studies-v5";
import type { MarketChartPoint } from "@/types";

// Closed-form exponentially weighted tail, deliberately not the production
// running recurrence. Tolerance is relative 1e-9 (large-scale fixtures included).
function weighted(values: number[], n: number, alpha: number): Array<number | null> {
  return values.map((_, t) => {
    if (t < n - 1) return null;
    const seed = values.slice(0, n).reduce((a, b) => a + b, 0) / n;
    return seed * (1 - alpha) ** (t - n + 1) + values.slice(n, t + 1).reduce((sum, x, j) => sum + alpha * x * (1 - alpha) ** (t - n - j), 0);
  });
}
function near(actual: Array<number | null>, expected: Array<number | null>) {
  expect(actual.length).toBe(expected.length);
  actual.forEach((value, i) => { if (expected[i] === null) expect(value).toBeNull(); else { expect(value).not.toBeNull(); expect(Math.abs(value! - expected[i]!)).toBeLessThanOrEqual(1e-9 * Math.max(1, Math.abs(expected[i]!))); } });
}
function fixture(kind: string, scale = 1): MarketChartPoint[] {
  return Array.from({ length: 120 }, (_, i) => {
    const c = kind === "flat" ? 100 : kind === "trend" ? 40 + 2 * i : 100 + Math.sin(i * 1.7) * 20 + Math.cos(i / 3) * 12;
    return { timestamp: new Date(Date.UTC(2025, 0, 1) + i * 3600_000).toISOString(), open: (c - 1) * scale, high: (c + 5) * scale, low: (c - 4) * scale, close: c * scale, volume: i % 3 ? 100 : 0 };
  });
}
function reference(bars: MarketChartPoint[], n: number, multiplier: number) {
  const tr = bars.map((b, i) => i ? Math.max(b.high - b.low, Math.abs(b.high - bars[i - 1].close), Math.abs(b.low - bars[i - 1].close)) : b.high - b.low);
  const atr = weighted(tr, n, 1 / n);
  const plus: number[] = [], minus: number[] = [];
  for (let i = 1; i < bars.length; i++) {
    const u = bars[i].high - bars[i - 1].high, d = bars[i - 1].low - bars[i].low;
    plus.push(u > 0 && u > d ? u : 0); minus.push(d > 0 && d > u ? d : 0);
  }
  const smoothTr = weighted(tr.slice(1), n, 1 / n), smoothPlus = weighted(plus, n, 1 / n), smoothMinus = weighted(minus, n, 1 / n);
  const diPlus = [null, ...smoothPlus.map((v, i) => v === null ? null : smoothTr[i] ? 100 * v / smoothTr[i]! : 0)];
  const diMinus = [null, ...smoothMinus.map((v, i) => v === null ? null : smoothTr[i] ? 100 * v / smoothTr[i]! : 0)];
  const dx = diPlus.slice(n).map((v, i) => v! + diMinus[n + i]! ? 100 * Math.abs(v! - diMinus[n + i]!) / (v! + diMinus[n + i]!) : 0);
  const adx = [...Array<number | null>(n).fill(null), ...weighted(dx, n, 1 / n)];
  const long = Array<number | null>(bars.length).fill(null), short = [...long], trend = [...long];
  const upper = [...long], lower = [...long]; let uptrend = true;
  for (let i = n - 1; i < bars.length; i++) {
    const u = (bars[i].high + bars[i].low) / 2 + multiplier * atr[i]!, l = (bars[i].high + bars[i].low) / 2 - multiplier * atr[i]!;
    upper[i] = i === n - 1 || bars[i - 1].close > upper[i - 1]! ? u : Math.min(u, upper[i - 1]!);
    lower[i] = i === n - 1 || bars[i - 1].close < lower[i - 1]! ? l : Math.max(l, lower[i - 1]!);
    if (i === n - 1) uptrend = bars[i].close >= (bars[i].high + bars[i].low) / 2;
    else if (uptrend && bars[i].close < lower[i]!) uptrend = false;
    else if (!uptrend && bars[i].close > upper[i]!) uptrend = true;
    trend[i] = uptrend ? lower[i] : upper[i];
    long[i] = Math.max(i === n - 1 ? -Infinity : long[i - 1]!, bars[i].close - multiplier * atr[i]!);
    short[i] = Math.min(i === n - 1 ? Infinity : short[i - 1]!, bars[i].close + multiplier * atr[i]!);
  }
  return { atr, diPlus, diMinus, adx, long, short, trend };
}
describe("independent numeric and point-in-time audit", () => {
  it.each([5, 10, 20, 21, 50, 100, 137, 150, 200])("SMA/EMA/SMMA %i match direct windows and closed-form weights", (n) => {
    const values = Array.from({ length: 650 }, (_, i) => 100 + i / 7 + Math.sin(i) * 4);
    near(simpleMovingAverage(values, n), values.map((_, i) => i < n - 1 ? null : values.slice(i - n + 1, i + 1).reduce((a, b) => a + b, 0) / n));
    near(exponentialMovingAverage(values, n), weighted(values, n, 2 / (n + 1)));
    near(smoothedMovingAverage(values, n), weighted(values, n, 1 / n));
  });
  for (const kind of ["flat", "trend", "volatile"]) for (const scale of [1e-6, 1, 1e8]) it(`${kind}, scale ${scale}: Wilder ADX/DMI, bands, ratchets and channels`, () => {
    const bars = fixture(kind, scale), expected = reference(bars, 14, 3), actual = directionalMovement(bars, 14);
    near(actual.positive, expected.diPlus); near(actual.negative, expected.diMinus); near(actual.adx, expected.adx);
    near(supertrend(bars, 14, 3).line, expected.trend);
    near(atrTrailingStop(bars, 14, 3, "LONG"), expected.long); near(atrTrailingStop(bars, 14, 3, "SHORT"), expected.short);
    near(atrTrailingStop(bars, 14, 3, "AUTO"), expected.trend);
    const channel = donchianChannels(bars, 14);
    near(channel.upper, bars.map((_, i) => i < 13 ? null : Math.max(...bars.slice(i - 13, i + 1).map((b) => b.high))));
    near(channel.lower, bars.map((_, i) => i < 13 ? null : Math.min(...bars.slice(i - 13, i + 1).map((b) => b.low))));
  });
  it("does not invent observations for short history or a missing trading observation", () => {
    const short = fixture("volatile").slice(0, 5);
    expect(supertrend(short, 14).line).toEqual([null, null, null, null, null]);
    expect(directionalMovement(short, 14).adx).toEqual([null, null, null, null, null]);
    const observed = fixture("volatile").filter((_, i) => i !== 48);
    const visible = observed.slice(50), config = { id: "ssma", kind: "SMMA" as const, period: 20, enabled: true, color: "#123456", source: "hlc3" as const };
    near(movingAverageOnVisibleHistory(observed, visible, config), weighted(observed.map((b) => (b.high + b.low + b.close) / 3), 20, 1 / 20).slice(50));
  });
  it("all confirmed prefixes survive extreme future mutation, including each direction and line branch", () => {
    const bars = fixture("volatile");
    const calculate = (rows: MarketChartPoint[]) => ({ trend: supertrend(rows), dmi: directionalMovement(rows), channel: donchianChannels(rows), long: atrTrailingStop(rows, 14, 3, "LONG"), short: atrTrailingStop(rows, 14, 3, "SHORT") });
    for (const size of [1, 10, 14, 28, 49, 87]) {
      const changed = bars.map((b, i) => i < size ? b : { ...b, open: b.open * 1e6, high: b.high * 1e6, low: b.low * 1e6, close: b.close * 1e6 });
      const prefix = calculate(bars.slice(0, size)), full = calculate(changed);
      for (const group of ["trend", "dmi", "channel"] as const) for (const key of Object.keys(prefix[group])) expect((full[group] as Record<string, unknown[]>)[key].slice(0, size)).toEqual((prefix[group] as Record<string, unknown[]>)[key]);
      expect(full.long.slice(0, size)).toEqual(prefix.long); expect(full.short.slice(0, size)).toEqual(prefix.short);
    }
  });
});
