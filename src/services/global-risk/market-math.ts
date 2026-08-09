import type { MarketChartPoint } from "@/types";

export interface MarketSeriesStats {
  price: number | null;
  oneDay: number | null;
  fiveDay: number | null;
  oneMonth: number | null;
  drawdown52Week: number | null;
  sma50: number | null;
  sma200: number | null;
  rsi14: number | null;
  annualizedVolatility: number | null;
  atrPercent: number | null;
  relativeVolume: number | null;
}

const finite = (value: unknown): value is number => typeof value === "number" && Number.isFinite(value);
const pct = (current: number | undefined, previous: number | undefined) => finite(current) && finite(previous) && previous !== 0 ? (current / previous - 1) * 100 : null;
const mean = (values: number[]) => values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : null;
const deviation = (values: number[]) => { const avg = mean(values); return avg === null || values.length < 2 ? null : Math.sqrt(values.reduce((sum, value) => sum + (value - avg) ** 2, 0) / (values.length - 1)); };

export function marketSeriesStats(input: MarketChartPoint[]): MarketSeriesStats {
  const points = input.filter((point) => finite(point.close) && point.close > 0).sort((a, b) => a.timestamp.localeCompare(b.timestamp));
  const closes = points.map((point) => point.close); const last = closes.at(-1); const tail = (count: number) => closes.slice(-count);
  const returns = closes.slice(1).map((value, index) => Math.log(value / closes[index]!)).filter(finite).slice(-60);
  const gains: number[] = []; const losses: number[] = [];
  for (let index = Math.max(1, closes.length - 14); index < closes.length; index++) { const change = closes[index]! - closes[index - 1]!; gains.push(Math.max(0, change)); losses.push(Math.max(0, -change)); }
  const avgGain = mean(gains); const avgLoss = mean(losses); const rsi14 = avgGain === null || avgLoss === null ? null : avgLoss === 0 ? 100 : 100 - 100 / (1 + avgGain / avgLoss);
  const trueRanges = points.slice(-20).map((point, index, slice) => { const previous = slice[index - 1]?.close ?? point.close; return Math.max(point.high - point.low, Math.abs(point.high - previous), Math.abs(point.low - previous)); }).filter(finite);
  const averageVolume = mean(points.slice(-21, -1).map((point) => point.volume).filter((value) => finite(value) && value > 0)); const currentVolume = points.at(-1)?.volume;
  const high52 = Math.max(...tail(252));
  return {
    price: last ?? null,
    oneDay: pct(last, closes.at(-2)),
    fiveDay: pct(last, closes.at(-6)),
    oneMonth: pct(last, closes.at(-22)),
    drawdown52Week: finite(last) && Number.isFinite(high52) && high52 > 0 ? (last / high52 - 1) * 100 : null,
    sma50: mean(tail(50)), sma200: mean(tail(200)), rsi14,
    annualizedVolatility: returns.length > 1 ? (deviation(returns) ?? 0) * Math.sqrt(252) * 100 : null,
    atrPercent: finite(last) && last > 0 ? (mean(trueRanges) ?? 0) / last * 100 : null,
    relativeVolume: finite(currentVolume) && averageVolume && averageVolume > 0 ? currentVolume / averageVolume : null,
  };
}

export function rollingCorrelation(first: MarketChartPoint[], second: MarketChartPoint[], lookback = 60): number | null {
  const closesA = new Map(first.map((point) => [point.timestamp.slice(0, 10), point.close]));
  const paired = second.filter((point) => closesA.has(point.timestamp.slice(0, 10))).map((point) => [closesA.get(point.timestamp.slice(0, 10))!, point.close] as const).slice(-(lookback + 1));
  if (paired.length < 15) return null;
  const returns = paired.slice(1).map((point, index) => [Math.log(point[0] / paired[index]![0]), Math.log(point[1] / paired[index]![1])] as const).filter(([a, b]) => finite(a) && finite(b));
  const a = returns.map((item) => item[0]); const b = returns.map((item) => item[1]); const ma = mean(a)!; const mb = mean(b)!;
  const numerator = returns.reduce((sum, item) => sum + (item[0] - ma) * (item[1] - mb), 0); const da = Math.sqrt(a.reduce((sum, value) => sum + (value - ma) ** 2, 0)); const db = Math.sqrt(b.reduce((sum, value) => sum + (value - mb) ** 2, 0));
  return da && db ? numerator / (da * db) : null;
}
