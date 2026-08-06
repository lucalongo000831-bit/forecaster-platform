import "server-only";

import type { AnnualPerformancePoint, MarketChartPoint, ReturnPeriod, TimePoint } from "@/types";

export function analyticalClose(point: MarketChartPoint): number { return point.adjustedClose ?? point.close; }

export function toTimeSeries(points: MarketChartPoint[]): TimePoint[] {
  return points.map((point) => ({
    label: point.timestamp.slice(0, 10),
    value: analyticalClose(point),
    volume: point.volume,
  }));
}

export function drawdowns(points: MarketChartPoint[]): TimePoint[] {
  let peak = 0;
  return points.map((point) => {
    const close = analyticalClose(point);
    peak = Math.max(peak, close);
    return { label: point.timestamp.slice(0, 10), value: peak ? ((close / peak) - 1) * 100 : 0 };
  });
}

export function annualPerformance(points: MarketChartPoint[]): AnnualPerformancePoint[] {
  const years = new Map<string, { first: number; last: number }>();
  for (const point of points) {
    const year = point.timestamp.slice(0, 4);
    const existing = years.get(year);
    const close = analyticalClose(point);
    if (existing) existing.last = close;
    else years.set(year, { first: close, last: close });
  }
  return [...years].map(([year, values]) => ({ year, value: ((values.last / values.first) - 1) * 100 }));
}

function returnForDays(points: MarketChartPoint[], days: number): number | null {
  const last = points.at(-1);
  if (!last) return null;
  const target = new Date(last.timestamp).getTime() - days * 86_400_000;
  const base = points.find((point) => new Date(point.timestamp).getTime() >= target) ?? points[0];
  const baseClose = base ? analyticalClose(base) : 0;
  return baseClose ? ((analyticalClose(last) / baseClose) - 1) * 100 : null;
}

export function periodReturns(points: MarketChartPoint[]): ReturnPeriod[] {
  const periods = [["1 Month", 30], ["6 Months", 182], ["1 Year", 365], ["3 Years", 1095], ["5 Years", 1825], ["10 Years", 3650], ["20 Years", 7300]] as const;
  const result: ReturnPeriod[] = [];
  for (const [label, days] of periods) {
    const value = returnForDays(points, days);
    if (value !== null) result.push({ label, value });
  }
  const year = new Date().getUTCFullYear().toString();
  const ytd = points.filter((point) => point.timestamp.startsWith(year));
  if (ytd.length > 1) result.splice(2, 0, { label: "This Year", value: ((analyticalClose(ytd.at(-1)!) / analyticalClose(ytd[0])) - 1) * 100 });
  return result;
}

export function simpleMovingAverage(values: number[], window: number): number[] {
  return values.map((_, index) => {
    const slice = values.slice(Math.max(0, index - window + 1), index + 1);
    return slice.reduce((sum, value) => sum + value, 0) / slice.length;
  });
}

export function relativeStrengthIndex(values: number[], period = 14): number[] {
  return values.map((_, index) => {
    if (index === 0) return 50;
    const start = Math.max(1, index - period + 1);
    let gains = 0; let losses = 0;
    for (let i = start; i <= index; i += 1) {
      const delta = values[i] - values[i - 1];
      if (delta >= 0) gains += delta; else losses -= delta;
    }
    if (losses === 0) return gains === 0 ? 50 : 100;
    return 100 - (100 / (1 + gains / losses));
  });
}
