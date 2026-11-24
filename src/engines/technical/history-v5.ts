import type { MarketChartPoint, TechnicalHistoricalRange, TechnicalHistoryCoverage, TechnicalTimeframe } from "@/types";
import { sanitizeTechnicalBars } from "./terminal";
import { US_EQUITY_EARLY_CLOSES } from "@/data/market-session-calendar";

const MINUTE = 60_000;
const DAY = 86_400_000;
const formatters = new Map<string, Intl.DateTimeFormat>();
export const TIMEFRAME_MINUTES: Record<TechnicalTimeframe, number> = { "1m": 1, "5m": 5, "15m": 15, "30m": 30, "1h": 60, "4h": 240, "1D": 1440, "1W": 10080 };
export function exchangeSession(symbol: string, exchange = "") {
  if (symbol.endsWith("-USD") || /CRYPTO/i.test(exchange)) return { timeZone: "UTC", open: 0, close: 1440, crypto: true, known: true };
  if (symbol.endsWith(".MI") || /MIL|MTA|BIT/i.test(exchange)) return { timeZone: "Europe/Rome", open: 540, close: 1050, crypto: false, known: true };
  if (symbol.endsWith(".L") || /LSE|LONDON/i.test(exchange)) return { timeZone: "Europe/London", open: 480, close: 990, crypto: false, known: true };
  const known = !symbol.includes(".") && !symbol.includes("=") || /NASDAQ|NYSE|AMEX|ARCA|^US$/i.test(exchange);
  return { timeZone: "America/New_York", open: 570, close: 960, crypto: false, known };
}
export function sessionClock(timestamp: string, timeZone: string) {
  if (!formatters.has(timeZone)) formatters.set(timeZone, new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }));
  const parts = formatters.get(timeZone)!.formatToParts(new Date(timestamp));
  const value = (type: string) => parts.find((item) => item.type === type)?.value ?? "0";
  return { date: `${value("year")}-${value("month")}-${value("day")}`, minute: Number(value("hour")) * 60 + Number(value("minute")) };
}

/** Aggregate only observed constituents. Short session-end buckets are valid;
 * a missing constituent inside a bucket invalidates it and is reported. */
export function resampleSessionBars(input: MarketChartPoint[], targetMinutes: number, sourceMinutes: number, symbol: string, exchange: string, asOf = Infinity) {
  const session = exchangeSession(symbol, exchange);
  const groups = new Map<string, { rows: MarketChartPoint[]; start: number; end: number }>();
  const clean = sanitizeTechnicalBars(input);
  for (const bar of clean) {
    // Quote-like trailing observations are not minute-aligned aggregate bars.
    if (Date.parse(bar.timestamp) % MINUTE !== 0) continue;
    const clock = sessionClock(bar.timestamp, session.timeZone);
    const close = session.timeZone === "America/New_York" ? US_EQUITY_EARLY_CLOSES[clock.date] ?? session.close : session.close;
    if (clock.minute < session.open || clock.minute >= close) continue;
    // Wall-hour equity bars cannot be split into session-aligned bars. Never mix pre-market prices.
    if ((clock.minute - session.open) % sourceMinutes !== 0) continue;
    const bucketMinute = session.open + Math.floor((clock.minute - session.open) / targetMinutes) * targetMinutes;
    const start = Date.parse(bar.timestamp) - (clock.minute - bucketMinute) * MINUTE;
    const duration = Math.min(targetMinutes, close - bucketMinute);
    const key = `${clock.date}:${bucketMinute}`;
    const group = groups.get(key) ?? { rows: [], start, end: start + duration * MINUTE };
    group.rows.push(bar); groups.set(key, group);
  }
  const missing: TechnicalHistoryCoverage["missingSegments"] = [];
  const bars = [...groups.values()].flatMap(({ rows, start, end }) => {
    const expected = Math.ceil((end - start) / (sourceMinutes * MINUTE));
    const contiguous = rows.every((row, index) => Date.parse(row.timestamp) === start + index * sourceMinutes * MINUTE);
    if (!contiguous || rows.length !== expected || end > asOf) {
      missing.push({ from: new Date(start).toISOString(), to: new Date(end).toISOString(), reason: "Missing source constituents or unfinished session bucket" });
      return [];
    }
    return [{ timestamp: new Date(start).toISOString(), open: rows[0].open, high: Math.max(...rows.map((row) => row.high)), low: Math.min(...rows.map((row) => row.low)), close: rows.at(-1)!.close, volume: rows.reduce((sum, row) => sum + row.volume, 0) }];
  });
  return { bars, missing, session };
}

/** Native daily/weekly feeds may append an intraperiod quote after the actual
 * aggregate. Keep the first native aggregate, never sum overlapping volumes.
 * Calendar anchors are provider-defined, not inferred from a possibly partial
 * first listing/holiday week; changing requested history cannot move them. */
export function normalizeNativePeriods(input: MarketChartPoint[], timeframe: "1D" | "1W", symbol: string, exchange: string, provider = "yahoo") {
  const clean = sanitizeTechnicalBars(input);
  const session = exchangeSession(symbol, exchange);
  // Massive weeks start Sunday: equities use ET, crypto uses UTC (provider
  // asset-class contract). Yahoo uses Monday in the instrument calendar.
  // Retain native OHLCV, never reaggregate overlapping bars.
  const weeklyTimeZone = provider === "massive" && !session.crypto ? "America/New_York" : session.timeZone;
  const anchorWeekday = provider === "massive" ? 0 : 1;
  const periods = new Map<number, MarketChartPoint>();
  let excluded = 0;
  for (const bar of clean) {
    const localDate = sessionClock(bar.timestamp, timeframe === "1W" ? weeklyTimeZone : session.timeZone).date;
    const day = Math.floor(Date.parse(`${localDate}T00:00:00Z`) / DAY);
    const key = timeframe === "1W" ? Math.floor((day + 4 - anchorWeekday) / 7) : day;
    if (periods.has(key)) { excluded++; continue; }
    periods.set(key, bar);
  }
  return { bars: [...periods.values()], excluded };
}

export function requestedHistoryBounds(range: TechnicalHistoricalRange, now: Date, custom?: { from?: string | null; to?: string | null }) {
  const end = custom?.to ? Math.min(Date.parse(`${custom.to}T23:59:59.999Z`), now.getTime()) : now.getTime();
  const days: Partial<Record<TechnicalHistoricalRange, number>> = { "1D": 1, "5D": 5, "1M": 31, "3M": 92, "6M": 183, "1Y": 366, "3Y": 1096, "5Y": 1827, "10Y": 3653 };
  const start = range === "CUSTOM" && custom?.from ? Date.parse(`${custom.from}T00:00:00Z`) : range === "MAX" ? Date.UTC(1970, 0, 1) : range === "YTD" ? Date.UTC(now.getUTCFullYear(), 0, 1) : end - (days[range] ?? 366) * DAY;
  if (!Number.isFinite(start) || !Number.isFinite(end) || start > end) throw new Error("Select a valid historical date range.");
  return { from: new Date(start).toISOString(), to: new Date(end).toISOString() };
}

export function historyCoverage(bars: MarketChartPoint[], timeframe: TechnicalTimeframe, bounds: { from: string; to: string }, provider: string, freshness: string, missing: TechnicalHistoryCoverage["missingSegments"] = [], limitations: string[] = [], continuousTrading = false): TechnicalHistoryCoverage {
  const actualFrom = bars[0]?.timestamp ?? null; const actualTo = bars.at(-1)?.timestamp ?? null;
  const tolerance = continuousTrading ? TIMEFRAME_MINUTES[timeframe] * MINUTE * 1.5 : timeframe === "1W" ? 10 * DAY : 4 * DAY;
  const detectableGaps = [...missing];
  for (let index = 1; index < bars.length; index++) {
    const previous = bars[index - 1]; const current = bars[index];
    const elapsed = Date.parse(current.timestamp) - Date.parse(previous.timestamp);
    const sameUtcDay = current.timestamp.slice(0, 10) === previous.timestamp.slice(0, 10);
    const maximumGap = continuousTrading ? TIMEFRAME_MINUTES[timeframe] * MINUTE * 1.5 : timeframe === "1W" ? 14 * DAY : timeframe === "1D" ? 7 * DAY : TIMEFRAME_MINUTES[timeframe] * MINUTE * 1.5;
    if (elapsed > maximumGap && (continuousTrading || sameUtcDay || ["1D", "1W"].includes(timeframe))) detectableGaps.push({ from: previous.timestamp, to: current.timestamp, reason: "Detected gap between verified observations; no prices synthesized." });
  }
  const spansBounds = actualFrom !== null && actualTo !== null && Date.parse(actualFrom) <= Date.parse(bounds.from) + tolerance && Date.parse(actualTo) >= Date.parse(bounds.to) - tolerance;
  return { requestedFrom: bounds.from, requestedTo: bounds.to, actualFrom, actualTo, interval: timeframe, barCount: bars.length, coverageStatus: !bars.length ? "UNAVAILABLE" : freshness === "STALE" ? "STALE" : spansBounds && !detectableGaps.length && !limitations.length ? "COMPLETE" : "PARTIAL", provider, freshness, missingSegments: detectableGaps, limitations };
}
