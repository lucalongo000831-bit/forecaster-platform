import type { MarketChartPoint } from "@/types";
import { mean, sampleStandardDeviation } from "../shared/statistics";
import { accumulationDistribution, averageTrueRange, exponentialMovingAverage, maximumDrawdown, normalizeScore, onBalanceVolume, relativeStrengthIndex, rollingZScore, simpleMovingAverage, trueRange } from "./indicators";
import { TECHNICAL_MODEL_VERSION, type IndicatorValue, type TechnicalAnalysis } from "./types";

function normalizeBars(input: MarketChartPoint[]) {
  const byTimestamp = new Map<string, MarketChartPoint>();
  for (const bar of input) {
    if (!bar.timestamp || ![bar.open, bar.high, bar.low, bar.close, bar.volume].every(Number.isFinite) || bar.high < bar.low || bar.volume < 0) continue;
    byTimestamp.set(bar.timestamp, bar);
  }
  return [...byTimestamp.values()].sort((a, b) => a.timestamp.localeCompare(b.timestamp));
}

function latest(values: Array<number | null>) { return values.at(-1) ?? null; }
function distance(price: number, average: number | null) { return average === null || average === 0 ? null : (price / average - 1) * 100; }
function slope(values: Array<number | null>, periods = 5) {
  const end = values.at(-1); const start = values.at(-(periods + 1));
  return end === null || end === undefined || start === null || start === undefined || start === 0 ? null : (end / start - 1) * 100;
}
function indicator(value: number | null, period: number, timestamp: string, observations: number): IndicatorValue { return { value, period, timestamp, observations: Math.min(observations, period) }; }
function performance(values: number[], periods: number) { return values.length <= periods ? null : (values.at(-1)! / values.at(-(periods + 1))! - 1) * 100; }
function relativePerformance(values: number[], benchmark: number[] | undefined, periods: number) {
  if (!benchmark) return null;
  const asset = performance(values, periods); const reference = performance(benchmark, periods);
  return asset === null || reference === null ? null : asset - reference;
}

export function analyzeTechnical(symbol: string, input: MarketChartPoint[], benchmarkInput?: { symbol: string; bars: MarketChartPoint[] }): TechnicalAnalysis {
  const bars = normalizeBars(input);
  if (bars.length < 30) throw new Error("INSUFFICIENT_TECHNICAL_DATA");
  const closes = bars.map((bar) => bar.adjustedClose ?? bar.close);
  const volumes = bars.map((bar) => bar.volume);
  const price = closes.at(-1)!;
  const timestamp = bars.at(-1)!.timestamp;
  const smaPeriods = [10, 20, 50, 100, 200] as const;
  const emaPeriods = [9, 12, 21, 26, 50, 200] as const;
  const smaSeries = Object.fromEntries(smaPeriods.map((period) => [period, simpleMovingAverage(closes, period)])) as Record<(typeof smaPeriods)[number], Array<number | null>>;
  const emaSeries = Object.fromEntries(emaPeriods.map((period) => [period, exponentialMovingAverage(closes, period)])) as Record<(typeof emaPeriods)[number], Array<number | null>>;
  const rsi = relativeStrengthIndex(closes, 14);
  const ranges = trueRange(bars); const atr = averageTrueRange(bars, 14);
  const macdSeries = closes.map((_, index) => emaSeries[12][index] === null || emaSeries[26][index] === null ? null : (emaSeries[12][index] as number) - (emaSeries[26][index] as number));
  const macdStart = macdSeries.findIndex((value) => value !== null);
  const compactMacd = macdStart < 0 ? [] : macdSeries.slice(macdStart) as number[];
  const compactSignal = exponentialMovingAverage(compactMacd, 9);
  const macd = latest(macdSeries); const macdSignal = latest(compactSignal); const macdHistogram = macd === null || macdSignal === null ? null : macd - macdSignal;
  const returns = closes.slice(1).map((close, index) => Math.log(close / closes[index])).filter(Number.isFinite);
  const recentReturns = returns.slice(-20); const realized = sampleStandardDeviation(recentReturns);
  const middle = latest(smaSeries[20]); const deviation20 = sampleStandardDeviation(closes.slice(-20));
  const upper = middle === null || deviation20 === null ? null : middle + 2 * deviation20;
  const lower = middle === null || deviation20 === null ? null : middle - 2 * deviation20;
  const volume20 = mean(volumes.slice(-20)); const volume50 = mean(volumes.slice(-50)); const volumeDeviation = sampleStandardDeviation(volumes.slice(-20));
  const volumeLatest = volumes.at(-1)!; const volumeZ = volume20 === null || volumeDeviation === null || volumeDeviation === 0 ? null : (volumeLatest - volume20) / volumeDeviation;
  const obv = onBalanceVolume(bars); const ad = accumulationDistribution(bars);
  const prior20 = bars.slice(-21, -1); const support20 = prior20.length ? Math.min(...prior20.map((bar) => bar.low)) : null; const resistance20 = prior20.length ? Math.max(...prior20.map((bar) => bar.high)) : null;
  const yearly = bars.slice(-252); const high52 = yearly.length ? Math.max(...yearly.map((bar) => bar.high)) : null; const low52 = yearly.length ? Math.min(...yearly.map((bar) => bar.low)) : null;
  const stochasticWindow = bars.slice(-14); const stochasticLow = stochasticWindow.length === 14 ? Math.min(...stochasticWindow.map((bar) => bar.low)) : null; const stochasticHigh = stochasticWindow.length === 14 ? Math.max(...stochasticWindow.map((bar) => bar.high)) : null;
  const stochasticK = stochasticLow === null || stochasticHigh === null || stochasticHigh === stochasticLow ? null : (price - stochasticLow) / (stochasticHigh - stochasticLow) * 100;
  const stochasticValues = bars.slice(-16).map((_, offset, sample) => {
    if (offset < 13) return null;
    const window = sample.slice(offset - 13, offset + 1); const low = Math.min(...window.map((bar) => bar.low)); const high = Math.max(...window.map((bar) => bar.high));
    return high === low ? null : ((window.at(-1)!.adjustedClose ?? window.at(-1)!.close) - low) / (high - low) * 100;
  }).filter((value): value is number => value !== null);
  const stochasticD = mean(stochasticValues.slice(-3));
  const sma50 = latest(smaSeries[50]); const sma200 = latest(smaSeries[200]); const previousSma50 = smaSeries[50].at(-6) ?? null; const previousSma200 = smaSeries[200].at(-6) ?? null;
  const cross = sma50 === null || sma200 === null || previousSma50 === null || previousSma200 === null ? "UNAVAILABLE" : previousSma50 <= previousSma200 && sma50 > sma200 ? "GOLDEN" : previousSma50 >= previousSma200 && sma50 < sma200 ? "DEATH" : "NONE";
  const trendInputs = [distance(price, latest(smaSeries[20])), distance(price, sma50), distance(price, sma200)].filter((value): value is number => value !== null);
  const trendScore = normalizeScore(50 + (mean(trendInputs) ?? 0) * 2 + (slope(smaSeries[20]) ?? 0));
  const latestRsi = latest(rsi); const momentumScore = normalizeScore(50 + ((latestRsi ?? 50) - 50) * 0.6 + (macdHistogram === null ? 0 : Math.sign(macdHistogram) * 10) + (performance(closes, 20) ?? 0));
  const annualized = realized === null ? null : realized * Math.sqrt(252) * 100;
  const atrPercent = latest(atr) === null ? null : latest(atr)! / price * 100;
  const volatilityScore = normalizeScore(60 - (atrPercent ?? 2) * 4 - Math.max(0, (annualized ?? 20) - 30) * 0.5);
  const volumeScore = normalizeScore(50 + ((volume20 && volume20 > 0 ? volumeLatest / volume20 : 1) - 1) * 30 + (obv.at(-1)! > obv.at(-21)! ? 10 : -10));
  const structureScore = normalizeScore(50 + (resistance20 !== null && price > resistance20 ? 25 : 0) - (support20 !== null && price < support20 ? 25 : 0) + (high52 ? (price / high52 - 0.8) * 50 : 0));
  const benchmarkBars = benchmarkInput ? normalizeBars(benchmarkInput.bars) : undefined; const benchmarkCloses = benchmarkBars?.map((bar) => bar.adjustedClose ?? bar.close);
  const relative = { oneMonth: relativePerformance(closes, benchmarkCloses, 21), threeMonths: relativePerformance(closes, benchmarkCloses, 63), sixMonths: relativePerformance(closes, benchmarkCloses, 126), oneYear: relativePerformance(closes, benchmarkCloses, 252) };
  const relativeValues = Object.values(relative).filter((value): value is number => value !== null); const relativeScore = relativeValues.length ? normalizeScore(50 + (mean(relativeValues) ?? 0) * 2) : null;
  const components = [trendScore, momentumScore, volatilityScore, volumeScore, structureScore, ...(relativeScore === null ? [] : [relativeScore])];
  const score = mean(components) ?? 50;
  const availableIndicators = [latest(smaSeries[20]), sma50, sma200, latestRsi, macd, latest(atr), annualized, volume20, support20, high52, relativeScore].filter((value) => value !== null).length;
  const indicatorFor = (period: number, value: number | null) => indicator(value, period, timestamp, bars.length);
  return {
    symbol, timestamp, calculatedAt: new Date().toISOString(), modelVersion: TECHNICAL_MODEL_VERSION, observations: bars.length, price, score, completeness: availableIndicators / 11 * 100,
    trend: {
      sma: { "10": indicatorFor(10, latest(smaSeries[10])), "20": indicatorFor(20, latest(smaSeries[20])), "50": indicatorFor(50, sma50), "100": indicatorFor(100, latest(smaSeries[100])), "200": indicatorFor(200, sma200) },
      ema: { "9": indicatorFor(9, latest(emaSeries[9])), "12": indicatorFor(12, latest(emaSeries[12])), "21": indicatorFor(21, latest(emaSeries[21])), "26": indicatorFor(26, latest(emaSeries[26])), "50": indicatorFor(50, latest(emaSeries[50])), "200": indicatorFor(200, latest(emaSeries[200])) },
      sma20Slope: slope(smaSeries[20]), sma50Slope: slope(smaSeries[50]), distanceFromSma20: distance(price, latest(smaSeries[20])), distanceFromSma50: distance(price, sma50), distanceFromSma200: distance(price, sma200), cross, score: trendScore,
    },
    momentum: { rsi14: indicatorFor(14, latestRsi), macd, macdSignal, macdHistogram, roc20: performance(closes, 20), stochasticK14: stochasticK, stochasticD3: stochasticD, momentum10: closes.length > 10 ? price - closes.at(-11)! : null, score: momentumScore },
    volatility: { trueRange: ranges.at(-1) ?? null, atr14: indicatorFor(14, latest(atr)), realized20: realized === null ? null : realized * 100, annualized20: annualized, bollingerUpper: upper, bollingerMiddle: middle, bollingerLower: lower, bollingerBandwidth: upper === null || lower === null || middle === null || middle === 0 ? null : (upper - lower) / middle * 100, priceZScore20: latest(rollingZScore(closes, 20)), maximumDrawdown: maximumDrawdown(closes), score: volatilityScore },
    volume: { average20: volume20, average50: volume50, relative20: volume20 && volume20 > 0 ? volumeLatest / volume20 : null, zScore20: volumeZ, obv: obv.at(-1) ?? null, accumulationDistribution: ad.at(-1) ?? null, score: volumeScore },
    structure: { support20, resistance20, donchianUpper20: resistance20, donchianLower20: support20, breakout: resistance20 !== null && price > resistance20, breakdown: support20 !== null && price < support20, distanceFrom52WeekHigh: high52 ? (price / high52 - 1) * 100 : null, distanceFrom52WeekLow: low52 ? (price / low52 - 1) * 100 : null, swingHigh: bars.slice(-5).length === 5 ? Math.max(...bars.slice(-5).map((bar) => bar.high)) : null, swingLow: bars.slice(-5).length === 5 ? Math.min(...bars.slice(-5).map((bar) => bar.low)) : null, score: structureScore },
    relativeStrength: { benchmarkSymbol: benchmarkInput?.symbol ?? null, ...relative, score: relativeScore },
    input: bars,
  };
}
