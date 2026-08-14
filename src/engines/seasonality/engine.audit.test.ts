import { describe, expect, it } from "vitest";
import type { MarketChartPoint } from "@/types";
import { analyzeSeasonality } from "./engine";

const DAY_MS = 86_400_000;
const GRID_POINTS = 1_000;
const NOW = new Date("2025-08-14T12:00:00.000Z");
const NUMERIC_TOLERANCE = 1e-8;
const INTERPOLATED_TOLERANCE = 5e-4;

type ReferenceBar = MarketChartPoint & { date: string; year: number; month: number; day: number; weekday: number; adjustedOpen: number; adjustedHigh: number; adjustedLow: number; adjustedClose: number };

function fixtureHistory(assetClass: "EQUITY" | "ETF" | "CRYPTO", fromYear = 2013, to = NOW): MarketChartPoint[] {
  const rows: MarketChartPoint[] = [];
  let adjustedPrice = assetClass === "CRYPTO" ? 500 : 40;
  for (let date = new Date(Date.UTC(fromYear, 0, 1)); date <= to; date = new Date(date.getTime() + DAY_MS)) {
    if (assetClass !== "CRYPTO" && (date.getUTCDay() === 0 || date.getUTCDay() === 6)) continue;
    const year = date.getUTCFullYear();
    const month = date.getUTCMonth();
    const day = date.getUTCDate();
    const adjustedOpen = adjustedPrice;
    const dailyReturn = 0.00018 + Math.sin((year * 17 + month * 11 + day) / 7) * 0.0016 + (month === 0 ? 0.0007 : month === 8 ? -0.00055 : 0);
    adjustedPrice *= 1 + dailyReturn;
    const splitMultiplier = assetClass === "EQUITY" && date < new Date("2021-07-01T00:00:00.000Z") ? 10 : 1;
    const dividendMultiplier = assetClass === "ETF" && date < new Date("2022-06-15T00:00:00.000Z") ? 1.035 : 1;
    const rawMultiplier = splitMultiplier * dividendMultiplier;
    const open = adjustedOpen * rawMultiplier;
    const close = adjustedPrice * rawMultiplier;
    rows.push({
      timestamp: date.toISOString(),
      open,
      high: Math.max(open, close) * 1.006,
      low: Math.min(open, close) * 0.994,
      close,
      adjustedClose: assetClass === "CRYPTO" ? close * 0.1 : adjustedPrice,
      volume: 1_000_000 + day * 1_000,
    });
  }
  return rows;
}

function referenceBars(points: MarketChartPoint[], assetClass: "EQUITY" | "ETF" | "CRYPTO"): ReferenceBar[] {
  return points.flatMap((point): ReferenceBar[] => {
    const date = new Date(point.timestamp);
    if (!Number.isFinite(date.getTime()) || !Number.isFinite(point.close) || point.close <= 0) return [];
    const factor = assetClass === "CRYPTO" || !point.adjustedClose || point.adjustedClose <= 0 ? 1 : point.adjustedClose / point.close;
    return [{
      ...point,
      date: date.toISOString().slice(0, 10),
      year: date.getUTCFullYear(),
      month: date.getUTCMonth() + 1,
      day: date.getUTCDate(),
      weekday: date.getUTCDay(),
      adjustedOpen: point.open * factor,
      adjustedHigh: point.high * factor,
      adjustedLow: point.low * factor,
      adjustedClose: point.close * factor,
    }];
  }).sort((left, right) => left.date.localeCompare(right.date));
}

function average(values: number[]) {
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function interpolateReference(values: number[], outputPoints: number) {
  if (values.length === 1) return Array.from({ length: outputPoints }, () => values[0]);
  return Array.from({ length: outputPoints }, (_, index) => {
    const position = index / (outputPoints - 1) * (values.length - 1);
    const lower = Math.floor(position);
    const upper = Math.min(values.length - 1, Math.ceil(position));
    return values[lower] + (values[upper] - values[lower]) * (position - lower);
  });
}

function curveReference(bars: ReferenceBar[], outputPoints = GRID_POINTS) {
  const base = bars[0].adjustedClose;
  return interpolateReference(bars.map((bar) => (bar.adjustedClose / base - 1) * 100), outputPoints);
}

function pearsonReference(left: number[], right: number[]) {
  const count = Math.min(left.length, right.length);
  const a = left.slice(0, count);
  const b = right.slice(0, count);
  const aMean = average(a);
  const bMean = average(b);
  let numerator = 0;
  let leftSquares = 0;
  let rightSquares = 0;
  for (let index = 0; index < count; index += 1) {
    const leftDelta = a[index] - aMean;
    const rightDelta = b[index] - bMean;
    numerator += leftDelta * rightDelta;
    leftSquares += leftDelta ** 2;
    rightSquares += rightDelta ** 2;
  }
  return numerator / Math.sqrt(leftSquares * rightSquares);
}

function completedYears(bars: ReferenceBar[], currentYear: number, assetClass: "EQUITY" | "ETF" | "CRYPTO") {
  const byYear = Map.groupBy(bars, (bar) => bar.year);
  const minimum = assetClass === "CRYPTO" ? 300 : 180;
  return [...byYear.entries()].filter(([year, rows]) => year < currentYear && rows.length >= minimum && rows[0].month <= 2 && rows.at(-1)!.month >= 11).map(([year]) => year).sort((a, b) => a - b);
}

function monthlyReturn(rows: ReferenceBar[]) {
  return (rows.at(-1)!.adjustedClose / rows[0].adjustedOpen - 1) * 100;
}

function signedScore(values: number[]) {
  const positiveRate = values.filter((value) => value > 0).length / values.length;
  return positiveRate === 0.5 ? 0 : positiveRate > 0.5 ? positiveRate * 100 : -(1 - positiveRate) * 100;
}

function manualTrade(bars: ReferenceBar[], year: number, start: string, end: string, side: "LONG" | "SHORT") {
  const crossesYear = end < start;
  const rows = bars.filter((bar) => bar.date >= `${year}-${start}` && bar.date <= `${year + (crossesYear ? 1 : 0)}-${end}`);
  const open = rows[0].adjustedOpen;
  const direction = side === "LONG" ? 1 : -1;
  const returnPct = (rows.at(-1)!.adjustedClose / open - 1) * 100 * direction;
  const excursions = rows.flatMap((bar) => [(bar.adjustedHigh / open - 1) * 100, (bar.adjustedLow / open - 1) * 100]);
  return { rows, returnPct, maxRise: Math.max(...excursions), maxDrop: Math.min(...excursions) };
}

function directionalReference(bars: ReferenceBar[], years: number[], selectedMonth: number) {
  const allowed = new Set(years);
  const closeReturns = bars.flatMap((bar, index) => {
    const previous = bars[index - 1];
    if (!previous || previous.year !== bar.year || !allowed.has(bar.year)) return [];
    return [{ bar, value: (bar.adjustedClose / previous.adjustedClose - 1) * 100 }];
  });
  const daily = closeReturns.filter((item) => item.bar.month === selectedMonth && item.bar.day === 15).map((item) => item.value);
  const weekly = closeReturns.filter((item) => item.bar.weekday === 1).map((item) => item.value);
  const monthly = years.map((year) => bars.filter((bar) => bar.year === year && bar.month === 1)).filter((rows) => rows.length >= 2).map(monthlyReturn);
  return { daily, weekly, monthly };
}

describe("Seasonality V2 independent quantitative audit", () => {
  it("matches independent monthly, probability, average, range, excursion, directional and correlation calculations", () => {
    const points = fixtureHistory("EQUITY");
    const bars = referenceBars(points, "EQUITY");
    const years = completedYears(bars, 2025, "EQUITY");
    const selectedYears = years.slice(-5);
    const result = analyzeSeasonality("NVDA", points, { assetClass: "EQUITY", windows: ["5Y"], selectedMonth: 1, rangeStart: "03-01", rangeEnd: "03-31", now: NOW }, "golden-provider", "golden-fixture");

    const januaryReturns = years.map((year) => bars.filter((bar) => bar.year === year && bar.month === 1)).map(monthlyReturn);
    const january = result.monthlyMatrix!.summary[0];
    expect(result.monthlyMatrix!.rows.find((row) => row.year === years.at(-1))!.cells[0].returnPct).toBeCloseTo(januaryReturns.at(-1)!, 8);
    expect(january.probability).toBeCloseTo(januaryReturns.filter((value) => value > 0).length / januaryReturns.length * 100, 8);
    expect(january.averageReturn).toBeCloseTo(average(januaryReturns), 8);

    const manualTrades = selectedYears.map((year) => manualTrade(bars, year, "03-01", "03-31", "LONG"));
    const range = result.tradeRange!.statistics.find((item) => item.seriesId === "5Y")!;
    expect(range.averageReturn).toBeCloseTo(average(manualTrades.map((trade) => trade.returnPct)), 8);
    expect(range.trades[0].returnPct).toBeCloseTo(manualTrades[0].returnPct, 8);
    expect(range.trades[0].maxDropPct).toBeCloseTo(manualTrades[0].maxDrop, 8);
    expect(range.trades[0].maxRisePct).toBeCloseTo(manualTrades[0].maxRise, 8);

    const directional = directionalReference(bars, selectedYears, 1);
    const dailyBucket = result.directional.daily[0].buckets.find((bucket) => bucket.key === 15)!;
    const mondayBucket = result.directional.weekly[0].buckets.find((bucket) => bucket.key === 1)!;
    const januaryBucket = result.directional.monthly[0].buckets.find((bucket) => bucket.key === 1)!;
    expect(dailyBucket.meanReturn).toBeCloseTo(average(directional.daily), 8);
    expect(dailyBucket.score).toBeCloseTo(signedScore(directional.daily), 8);
    expect(mondayBucket.meanReturn).toBeCloseTo(average(directional.weekly), 8);
    expect(mondayBucket.score).toBeCloseTo(signedScore(directional.weekly), 8);
    expect(januaryBucket.meanReturn).toBeCloseTo(average(directional.monthly), 8);
    expect(januaryBucket.score).toBeCloseTo(signedScore(directional.monthly), 8);

    const currentBars = bars.filter((bar) => bar.year === 2025);
    const currentCount = Math.max(2, Math.floor(Math.min(1, currentBars.length / 252) * 999) + 1);
    const current = curveReference(currentBars, currentCount);
    const historical = selectedYears.map((year) => curveReference(bars.filter((bar) => bar.year === year)));
    const averageCurve = Array.from({ length: GRID_POINTS }, (_, index) => average(historical.map((curve) => curve[index])));
    const expectedCorrelation = pearsonReference(current, averageCurve.slice(0, current.length));
    expect(result.curves.find((curve) => curve.id === "5Y")!.correlation!.rawCorrelation).toBeCloseTo(expectedCorrelation, 3);
    expect(Math.abs(result.curves.find((curve) => curve.id === "5Y")!.correlation!.rawCorrelation! - expectedCorrelation)).toBeLessThan(INTERPOLATED_TOLERANCE);
  });

  it("uses exact completed-year membership for every requested horizon", () => {
    const points = fixtureHistory("EQUITY", 1998);
    const result = analyzeSeasonality("MSFT", points, { windows: ["1Y", "3Y", "5Y", "7Y", "10Y", "15Y", "20Y", "25Y", "MAX"], now: NOW }, "golden-provider");
    const completed = result.availableHistory.completedYears;
    for (const id of ["1Y", "3Y", "5Y", "7Y", "10Y", "15Y", "20Y", "25Y"] as const) {
      const count = Number.parseInt(id, 10);
      expect(result.curves.find((curve) => curve.id === id)!.sampleYears).toEqual(completed.slice(-count));
    }
    expect(result.curves.find((curve) => curve.id === "MAX")!.sampleYears).toEqual(completed);
  });

  it("excludes the partial current year and current month from every aggregate", () => {
    const points = fixtureHistory("EQUITY");
    const result = analyzeSeasonality("AAPL", points, { windows: ["5Y"], selectedMonth: 8, now: NOW }, "golden-provider");
    const current = result.curves.find((curve) => curve.id === "CURRENT")!;
    expect(current.available).toBe(true);
    expect(current.points.length).toBeLessThan(GRID_POINTS);
    expect(result.curves.find((curve) => curve.id === "5Y")!.sampleYears).not.toContain(2025);
    expect(result.monthlyMatrix!.summary[7].years).not.toContain(2025);
    expect(result.directional.daily[0].buckets.flatMap((bucket) => bucket.years)).not.toContain(2025);
    expect(result.directional.weekly[0].buckets.flatMap((bucket) => bucket.years)).not.toContain(2025);
    expect(result.directional.monthly[0].buckets.flatMap((bucket) => bucket.years)).not.toContain(2025);
    expect(result.monthlyMatrix!.rows.find((row) => row.year === 2025)!.cells[7].status).toBe("IN_PROGRESS");
  });

  it("marks a one-session current month as partial instead of missing", () => {
    const onlyFirstAugustSession = fixtureHistory("EQUITY", 2013, new Date("2025-08-01T12:00:00.000Z"));
    const result = analyzeSeasonality("AAPL", onlyFirstAugustSession, { windows: ["5Y"], now: new Date("2025-08-01T12:00:00.000Z") }, "golden-provider");
    const august = result.monthlyMatrix!.rows.find((row) => row.year === 2025)!.cells[7];
    expect(august.status).toBe("IN_PROGRESS");
    expect(august.returnPct).toBeNull();
  });

  it("does not include the prior year close in directional returns", () => {
    const points = fixtureHistory("EQUITY");
    const first2024 = points.findIndex((point) => point.timestamp.startsWith("2024-01"));
    const distorted = points.map((point, index) => index === first2024 ? { ...point, open: point.open * 25, high: point.high * 25, low: point.low * 25, close: point.close * 25, adjustedClose: point.adjustedClose! * 25 } : point);
    const bars = referenceBars(distorted, "EQUITY");
    const selectedYears = completedYears(bars, 2025, "EQUITY").slice(-5);
    const manual = directionalReference(bars, selectedYears, 1);
    const result = analyzeSeasonality("AAPL", distorted, { windows: ["5Y"], selectedMonth: 1, now: NOW }, "golden-provider");
    const weekday = new Date(points[first2024].timestamp).getUTCDay();
    const actual = result.directional.weekly[0].buckets.find((bucket) => bucket.key === weekday)!;
    const expectedValues = bars.flatMap((bar, index) => {
      const previous = bars[index - 1];
      if (!previous || previous.year !== bar.year || !selectedYears.includes(bar.year) || bar.weekday !== weekday) return [];
      return [(bar.adjustedClose / previous.adjustedClose - 1) * 100];
    });
    expect(actual.meanReturn).toBeCloseTo(average(expectedValues), 8);
    expect(manual.weekly.length).toBeGreaterThan(0);
  });

  it("keeps best-year ranking independent from candidate future prices", () => {
    const points = fixtureHistory("EQUITY");
    const base = analyzeSeasonality("NVDA", points, { windows: ["5Y"], now: NOW, includeCorrelations: true }, "golden-provider");
    const altered = points.map((point) => {
      const date = new Date(point.timestamp);
      if (date.getUTCFullYear() >= 2025 || date.getUTCMonth() < 9) return point;
      const factor = 1 + ((date.getUTCFullYear() % 7) + 1) * 3;
      return { ...point, open: point.open * factor, high: point.high * factor, low: point.low * factor, close: point.close * factor, adjustedClose: point.adjustedClose! * factor };
    });
    const changed = analyzeSeasonality("NVDA", altered, { windows: ["5Y"], now: NOW, includeCorrelations: true }, "golden-provider");
    expect(changed.bestCorrelatedYear.year).toBe(base.bestCorrelatedYear.year);
    expect(changed.bestCorrelatedYear.correlation.rawCorrelation).toBeCloseTo(base.bestCorrelatedYear.correlation.rawCorrelation!, 8);
  });

  it("selects the independently highest current-YTD Pearson correlation", () => {
    const points = fixtureHistory("EQUITY");
    const bars = referenceBars(points, "EQUITY");
    const result = analyzeSeasonality("NVDA", points, { windows: ["5Y"], now: NOW, includeCorrelations: true }, "golden-provider");
    const currentBars = bars.filter((bar) => bar.year === 2025);
    const currentCount = Math.max(2, Math.floor(Math.min(1, currentBars.length / 252) * 999) + 1);
    const current = curveReference(currentBars, currentCount);
    const ranking = result.availableHistory.completedYears.map((year) => ({ year, correlation: pearsonReference(current, curveReference(bars.filter((bar) => bar.year === year)).slice(0, current.length)) })).sort((left, right) => right.correlation - left.correlation);
    expect(result.bestCorrelatedYear.year).toBe(ranking[0].year);
  });

  it("classifies the documented presidential-cycle sample", () => {
    const result = analyzeSeasonality("NVDA", fixtureHistory("EQUITY", 2018), { windows: ["5Y"], now: NOW }, "golden-provider");
    const samples = new Map(result.presidentialCycles.map((cycle) => [cycle.cycle, cycle.sampleYears]));
    expect(samples.get("ELECTION")).toContain(2024);
    expect(samples.get("POST_ELECTION")).not.toContain(2025);
    expect(samples.get("MIDTERM")).toContain(2022);
    expect(samples.get("PRE_ELECTION")).toContain(2023);
  });

  it("maps equity weekend boundaries and preserves crypto weekends", () => {
    const equity = analyzeSeasonality("AAPL", fixtureHistory("EQUITY"), { windows: ["5Y"], rangeStart: "01-06", rangeEnd: "01-14", now: NOW }, "golden-provider");
    const equityTrades = equity.tradeRange!.statistics[0].trades;
    expect(equityTrades.every((trade) => ![0, 6].includes(new Date(`${trade.openDate}T00:00:00Z`).getUTCDay()))).toBe(true);
    expect(equityTrades.every((trade) => ![0, 6].includes(new Date(`${trade.closeDate}T00:00:00Z`).getUTCDay()))).toBe(true);
    const crypto = analyzeSeasonality("BTC-USD", fixtureHistory("CRYPTO", 2018), { assetClass: "CRYPTO", windows: ["5Y"], rangeStart: "01-06", rangeEnd: "01-14", now: NOW }, "golden-provider");
    expect(crypto.tradeRange!.statistics[0].trades.some((trade) => new Date(`${trade.openDate}T00:00:00Z`).getUTCDay() === 6)).toBe(true);
    expect(crypto.directional.weekly[0].buckets.map((bucket) => bucket.label)).toEqual(["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"]);
  });

  it("supports cross-year LONG/SHORT symmetry", () => {
    const points = fixtureHistory("ETF");
    const long = analyzeSeasonality("SPY", points, { assetClass: "ETF", windows: ["5Y"], rangeStart: "12-20", rangeEnd: "01-10", side: "LONG", now: NOW }, "golden-provider");
    const short = analyzeSeasonality("SPY", points, { assetClass: "ETF", windows: ["5Y"], rangeStart: "12-20", rangeEnd: "01-10", side: "SHORT", now: NOW }, "golden-provider");
    expect(long.tradeRange!.crossesYear).toBe(true);
    expect(short.tradeRange!.statistics[0].probability).toBeCloseTo(100 - long.tradeRange!.statistics[0].probability!, 8);
    expect(short.tradeRange!.statistics[0].averageReturn).toBeCloseTo(-long.tradeRange!.statistics[0].averageReturn!, 8);
  });

  it("uses adjusted OHLC across equity splits and ETF dividends without artificial crashes", () => {
    for (const [symbol, assetClass] of [["NVDA", "EQUITY"], ["SPY", "ETF"]] as const) {
      const result = analyzeSeasonality(symbol, fixtureHistory(assetClass), { assetClass, windows: ["5Y", "10Y"], rangeStart: "06-01", rangeEnd: "08-01", now: NOW }, "golden-provider");
      expect(result.annualReturns.every((value) => value > -90 && value < 900)).toBe(true);
      expect(result.tradeRange!.statistics.flatMap((item) => item.trades).every((trade) => trade.maxDropPct > -90 && trade.maxRisePct < 900)).toBe(true);
    }
  });

  it("does not fabricate long windows for short crypto history", () => {
    const result = analyzeSeasonality("ETH-USD", fixtureHistory("CRYPTO", 2019), { assetClass: "CRYPTO", windows: ["5Y", "10Y", "15Y", "20Y", "25Y"], now: NOW }, "golden-provider");
    expect(result.curves.find((curve) => curve.id === "5Y")!.available).toBe(true);
    for (const id of ["10Y", "15Y", "20Y", "25Y"]) {
      const curve = result.curves.find((item) => item.id === id)!;
      expect(curve.available).toBe(false);
      expect(curve.points).toHaveLength(0);
    }
  });

  it("keeps provider metadata, canonical history and hashes symbol-specific", () => {
    const aaplPoints = fixtureHistory("EQUITY");
    const nvdaPoints = fixtureHistory("EQUITY").map((point) => ({ ...point, close: point.close * 1.01, adjustedClose: point.adjustedClose! * 1.01 }));
    const aapl = analyzeSeasonality("AAPL", aaplPoints, { windows: ["5Y"], now: NOW }, "provider-a", "database:lkg");
    const nvda = analyzeSeasonality("NVDA", nvdaPoints, { windows: ["5Y"], now: NOW }, "provider-b", "provider:live-history");
    expect(aapl.provider).toBe("provider-a");
    expect(aapl.source).toBe("database:lkg");
    expect(nvda.provider).toBe("provider-b");
    expect(aapl.historyHash).not.toBe(nvda.historyHash);
    expect(aapl.symbol).not.toBe(nvda.symbol);
    expect(aapl.observations).toBe(aapl.availableHistory.observations);
  });

  it("documents the numerical tolerance used by this independent audit", () => {
    expect(NUMERIC_TOLERANCE).toBe(1e-8);
    expect(INTERPOLATED_TOLERANCE).toBe(5e-4);
  });
});
