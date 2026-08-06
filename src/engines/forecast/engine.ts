import { clamp, mean, percentile, sampleStandardDeviation } from "@/engines/shared/statistics";
import { FORECAST_MODEL_VERSION, type ForecastAnalysis, type ForecastEngineInput, type ForecastHorizon } from "./types";

export const FORECAST_HORIZON_DAYS: Record<ForecastHorizon, number> = { "1d": 1, "5d": 5, "10d": 10, "20d": 20, "1m": 21, "3m": 63, "6m": 126, "12m": 252 };

function hashSeed(value: string) { let hash = 2166136261; for (const character of value) { hash ^= character.charCodeAt(0); hash = Math.imul(hash, 16777619); } return hash >>> 0; }
function randomGenerator(seed: number) { let state = seed || 1; return () => { state = (Math.imul(1664525, state) + 1013904223) >>> 0; return state / 4294967296; }; }
function normal(random: () => number) { const first = Math.max(random(), Number.EPSILON); const second = random(); return Math.sqrt(-2 * Math.log(first)) * Math.cos(2 * Math.PI * second); }
function countAbove(values: number[], threshold: number) { return values.filter((value) => value > threshold).length / values.length * 100; }
function countBelow(values: number[], threshold: number) { return values.filter((value) => value < threshold).length / values.length * 100; }
function pricePercentile(values: number[], probability: number) { return percentile(values, probability) as number; }

function walkForwardError(prices: number[], horizonDays: number) {
  const errors: number[] = [];
  const start = Math.max(126, prices.length - 750);
  for (let index = start; index + horizonDays < prices.length; index += Math.max(1, Math.floor(horizonDays / 4))) {
    const history = prices.slice(Math.max(0, index - 126), index + 1);
    const returns = history.slice(1).map((price, offset) => Math.log(price / history[offset]));
    const drift = clamp((mean(returns) ?? 0) * 0.25, -0.001, 0.001);
    const predicted = prices[index] * Math.exp(drift * horizonDays);
    const actual = prices[index + horizonDays];
    errors.push(Math.abs(predicted - actual) / actual * 100);
  }
  return { error: mean(errors), windows: errors.length, coveragePercent: clamp(errors.length / Math.max(1, Math.floor((prices.length - start) / Math.max(1, Math.floor(horizonDays / 4)))) * 100, 0, 100) };
}

export function analyzeForecast(input: ForecastEngineInput): ForecastAnalysis {
  const bars = [...new Map(input.bars.filter((bar) => bar.timestamp && Number.isFinite(bar.adjustedClose ?? bar.close) && (bar.adjustedClose ?? bar.close) > 0).map((bar) => [bar.timestamp, bar])).values()].sort((a, b) => a.timestamp.localeCompare(b.timestamp));
  if (bars.length < 130) throw new Error("INSUFFICIENT_FORECAST_DATA");
  const prices = bars.map((bar) => bar.adjustedClose ?? bar.close);
  const returns = prices.slice(1).map((price, index) => Math.log(price / prices[index])).filter(Number.isFinite);
  const currentPrice = prices.at(-1)!;
  const horizonDays = FORECAST_HORIZON_DAYS[input.horizon];
  const simulations = Math.round(clamp(input.simulations ?? 4_000, 1_000, 20_000));
  const recentVolatility = sampleStandardDeviation(returns.slice(-60)) ?? 0;
  const longVolatility = sampleStandardDeviation(returns.slice(-504)) ?? recentVolatility;
  const calibratedVolatility = (recentVolatility * 0.65 + longVolatility * 0.35) * (input.regime.volatility === "HIGH" ? 1.15 : 1);
  const historicalDrift = clamp((mean(returns.slice(-252)) ?? 0) * 0.25, -0.001, 0.001);
  const trendAdjustment = clamp((input.technical.trend.score - 50) * 0.00001, -0.00025, 0.00025);
  const regimeAdjustment = input.regime.direction === "BULL" ? 0.0001 : input.regime.direction === "BEAR" ? -0.0001 : 0;
  const month = new Date(bars.at(-1)!.timestamp).getUTCMonth() + 1;
  const seasonalMean = input.seasonality?.monthly.find((bucket) => bucket.key === month)?.mean ?? 0;
  const seasonalityAdjustment = clamp(seasonalMean / 100 / 21 * 0.15, -0.00015, 0.00015);
  const conditionedDrift = historicalDrift + trendAdjustment + regimeAdjustment + seasonalityAdjustment;
  const random = randomGenerator(hashSeed(`${input.symbol}:${input.horizon}:${bars.at(-1)!.timestamp}:${simulations}`));
  const outcomes: number[] = [];
  const sourceReturns = returns.slice(-756);
  for (let simulation = 0; simulation < simulations; simulation += 1) {
    let cumulative = 0;
    if (simulation % 3 === 0) {
      for (let day = 0; day < horizonDays; day += 1) cumulative += sourceReturns[Math.floor(random() * sourceReturns.length)] + conditionedDrift * 0.35;
    } else if (simulation % 3 === 1) {
      for (let day = 0; day < horizonDays;) {
        const start = Math.floor(random() * Math.max(1, sourceReturns.length - 5));
        for (let block = 0; block < 5 && day < horizonDays; block += 1, day += 1) cumulative += sourceReturns[start + block] + conditionedDrift * 0.35;
      }
    } else {
      for (let day = 0; day < horizonDays; day += 1) cumulative += conditionedDrift + calibratedVolatility * normal(random);
    }
    outcomes.push(currentPrice * Math.exp(cumulative));
  }
  outcomes.sort((a, b) => a - b);
  const percentiles = { p5: pricePercentile(outcomes, 0.05), p10: pricePercentile(outcomes, 0.1), p25: pricePercentile(outcomes, 0.25), p50: pricePercentile(outcomes, 0.5), p75: pricePercentile(outcomes, 0.75), p90: pricePercentile(outcomes, 0.9), p95: pricePercentile(outcomes, 0.95) };
  const averageOutcome = mean(outcomes) ?? percentiles.p50;
  const validation = walkForwardError(prices, horizonDays);
  const lengthQuality = clamp(returns.length / 7.56, 0, 100);
  const errorQuality = validation.error === null ? 25 : clamp(100 - validation.error * 3, 10, 100);
  const confidence = clamp(lengthQuality * 0.35 + errorQuality * 0.35 + input.technical.completeness * 0.15 + input.regime.confidence * 0.15, 0, 100);
  const distribution = ([5, 10, 25, 50, 75, 90, 95] as const).map((value) => ({ percentile: value, label: `P${value}`, price: percentiles[`p${value}` as keyof typeof percentiles] }));
  return {
    symbol: input.symbol, horizon: input.horizon, horizonDays, currentPrice, currency: input.currency,
    percentiles, distribution, expectedReturn: (averageOutcome / currentPrice - 1) * 100,
    expectedRange: { low: percentiles.p10, high: percentiles.p90 },
    probabilityAboveCurrentPrice: countAbove(outcomes, currentPrice), probabilityBelowCurrentPrice: countBelow(outcomes, currentPrice),
    targetPrice: input.targetPrice ?? null, stopPrice: input.stopPrice ?? null,
    probabilityAboveTarget: input.targetPrice ? countAbove(outcomes, input.targetPrice) : null,
    probabilityBelowStop: input.stopPrice ? countBelow(outcomes, input.stopPrice) : null,
    confidence, sampleSize: returns.length, simulations, modelError: validation.error,
    backtestCoverage: { windows: validation.windows, coveragePercent: validation.coveragePercent },
    methods: ["Historical bootstrap", "Five-day block bootstrap", "Monte Carlo with calibrated volatility", "Walk-forward error against realized prices"],
    assumptions: [`Prudential daily drift ${(conditionedDrift * 100).toFixed(3)}%.`, `Calibrated daily volatility ${(calibratedVolatility * 100).toFixed(2)}%.`, `Market regime ${input.regime.regime}.`],
    modelVersion: FORECAST_MODEL_VERSION, dataTimestamp: bars.at(-1)!.timestamp, generatedAt: new Date().toISOString(),
    disclaimer: "Distribuzione sperimentale basata su dati storici: non garantisce risultati futuri e non costituisce consulenza finanziaria.",
  };
}
