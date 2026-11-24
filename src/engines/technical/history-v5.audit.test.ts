import { describe, expect, it } from "vitest";
import { normalizeNativePeriods, resampleSessionBars } from "./history-v5";
import { applyCanonicalPricePolicy } from "./terminal";
import type { MarketChartPoint } from "@/types";
const hour = 3600_000;
const raw = (start: string, n: number): MarketChartPoint[] => Array.from({ length: n }, (_, i) => ({ timestamp: new Date(Date.parse(start) + i * hour).toISOString(), open: 10 + i, high: 15 + i, low: 8 + i, close: 12 + i, volume: i + 1 }));
describe("independent hand-verifiable OHLC oracles", () => {
  it.each(["2026-03-06T14:30:00Z", "2026-03-09T13:30:00Z", "2026-10-30T13:30:00Z", "2026-11-02T14:30:00Z"])("US DST boundary and 2.5h session tail: %s", (start) => {
    const rows = raw(start, 7), actual = resampleSessionBars(rows, 240, 60, "NVDA", "NASDAQ");
    expect(actual.bars).toEqual([
      { timestamp: new Date(start).toISOString(), open: 10, high: 18, low: 8, close: 15, volume: 10 },
      { timestamp: new Date(Date.parse(start) + 4 * hour).toISOString(), open: 14, high: 21, low: 12, close: 18, volume: 18 },
    ]);
    expect(resampleSessionBars(rows, 1440, 60, "NVDA", "NASDAQ").bars).toEqual([{ timestamp: new Date(start).toISOString(), open: 10, high: 21, low: 8, close: 18, volume: 28 }]);
  });
  it("does not treat the fourth source hour still forming as a closed 4h candle", () => {
    const rows = raw("2026-10-23T00:00:00Z", 8);
    const actual = resampleSessionBars(rows, 240, 60, "BTC-USD", "CRYPTO", Date.parse("2026-10-23T07:15:00Z"));
    expect(actual.bars).toEqual([{ timestamp: rows[0].timestamp, open: 10, high: 18, low: 8, close: 15, volume: 10 }]);
    expect(actual.missing).toHaveLength(1);
  });
  it("retains early-close tails but drops a missing opening constituent, never inventing it", () => {
    const rows = raw("2025-11-28T14:30:00Z", 4);
    expect(resampleSessionBars(rows, 240, 60, "SPY", "ARCA").bars).toEqual([{ timestamp: rows[0].timestamp, open: 10, high: 18, low: 8, close: 15, volume: 10 }]);
    expect(resampleSessionBars(rows.slice(1), 240, 60, "SPY", "ARCA").bars).toEqual([]);
  });
  it("uses Milan local session after the different EU/US DST weekends", () => {
    expect(resampleSessionBars(raw("2026-03-23T08:00Z", 9), 240, 60, "STLAM.MI", "MIL").bars.map((b) => b.volume)).toEqual([10, 26, 9]);
    expect(resampleSessionBars(raw("2026-03-30T07:00Z", 9), 240, 60, "STLAM.MI", "MIL").bars.map((b) => b.volume)).toEqual([10, 26, 9]);
  });
  it("keeps authentic IPO and holiday weeks and excludes only overlapping quote volumes", () => {
    const rows = [raw("1999-01-22T14:30Z", 1)[0], raw("1999-01-25T05:00Z", 1)[0], raw("1999-01-29T21:00Z", 1)[0]];
    rows[0].volume = 17; rows[1].volume = 31; rows[2].volume = 99;
    expect(normalizeNativePeriods(rows, "1W", "NVDA", "NASDAQ").bars.map((b) => b.volume)).toEqual([17, 31]);
  });
  it("does not shift a Massive crypto Sunday UTC week into Saturday ET and double-count its Friday tail", () => {
    const weekly = { ...raw("2026-10-11T00:00:00Z", 1)[0], volume: 1234 };
    const quote = { ...raw("2026-10-16T20:00:00Z", 1)[0], volume: 56 };
    expect(normalizeNativePeriods([weekly, quote], "1W", "BTC-USD", "CRYPTO", "massive").bars).toEqual([weekly]);
  });
  it("adjusts each OHLC by the exact ratio, with only an enclosure rounding correction and unchanged volume", () => {
    const source = { ...raw("2015-07-16T13:30Z", 1)[0], open: 20, high: 22, low: 18, close: 21, adjustedClose: .48742738366127014 };
    const actual = applyCanonicalPricePolicy([source], "EQUITY").bars[0], ratio = source.adjustedClose / 21;
    expect(actual.open).toBe(20 * ratio); expect(actual.close).toBe(source.adjustedClose);
    expect(actual.high).toBe(Math.max(22 * ratio, 20 * ratio, source.adjustedClose));
    expect(actual.low).toBe(Math.min(18 * ratio, 20 * ratio, source.adjustedClose)); expect(actual.volume).toBe(source.volume);
  });
});
