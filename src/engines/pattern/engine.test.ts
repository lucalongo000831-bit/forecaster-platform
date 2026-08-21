import { describe, expect, it } from "vitest";
import type { MarketChartPoint } from "@/types";
import {
  analyzePattern,
  calculateOutcomeMetrics,
  calculatePatternProbability,
  calculatePatternRobustness,
  calculatePatternSimilarity,
  classifyPatternStrength,
  PATTERN_LOOKBACK_OBSERVATIONS,
  PATTERN_MODEL_VERSION,
  type PatternMatchedEvent,
  type PatternRobustness,
} from ".";

const DAY_MS = 86_400_000;

function history({ start = "2000-01-03", observations = 2_400, crypto = false, adjusted = false }: { start?: string; observations?: number; crypto?: boolean; adjusted?: boolean } = {}) {
  const points: MarketChartPoint[] = [];
  let time = Date.parse(`${start}T00:00:00.000Z`);
  let close = 80;
  while (points.length < observations) {
    const date = new Date(time);
    const weekend = date.getUTCDay() === 0 || date.getUTCDay() === 6;
    if (crypto || !weekend) {
      const index = points.length;
      close *= Math.exp(0.00025 + Math.sin(index / 17) * 0.004 + Math.cos(index / 43) * 0.002);
      points.push({ timestamp: date.toISOString(), open: close * 0.998, high: close * 1.012, low: close * 0.988, close, adjustedClose: adjusted ? close : undefined, volume: 1_000_000 + index });
    }
    time += DAY_MS;
  }
  return points;
}

function replaceShape(points: MarketChartPoint[], startIndex: number, shape: number[]) {
  const base = points[startIndex].close;
  shape.forEach((value, offset) => {
    const close = base * Math.exp(value);
    Object.assign(points[startIndex + offset], { open: close * 0.999, high: close * 1.01, low: close * 0.99, close, adjustedClose: close });
  });
}

function event(overrides: Partial<PatternMatchedEvent> = {}): PatternMatchedEvent {
  return {
    id: "event",
    rank: 1,
    startDate: "2000-01-03",
    matchEndDate: "2000-02-01",
    outcomeEndDate: "2000-03-01",
    similarity: 90,
    similarityComponents: { correlation: 90, shapeDistance: 90, directionalAgreement: 90, volatilitySimilarity: 90, trendSimilarity: 90 },
    direction: "BULLISH",
    performance: 0.1,
    maxDrop: -0.02,
    maxRise: 0.12,
    neutralThreshold: 0.005,
    normalizedFuturePath: [{ observation: 0, date: null, value: 0 }, { observation: 1, date: "2000-02-02", value: 0.1 }],
    observations: 21,
    ...overrides,
  };
}

describe("Pattern Engine V2 quantitative core", () => {
  it("supports exact 1M, 3M and 6M observation/outcome horizons", () => {
    const points = history({ observations: 5_000 });
    for (const lookback of ["1M", "3M", "6M"] as const) {
      const analysis = analyzePattern("NVDA", points, { lookback, minimumSimilarity: 0 });
      expect(analysis.modelVersion).toBe(PATTERN_MODEL_VERSION);
      expect(analysis.lookbackObservations).toBe(PATTERN_LOOKBACK_OBSERVATIONS[lookback]);
      expect(analysis.outcomeObservations).toBe(PATTERN_LOOKBACK_OBSERVATIONS[lookback]);
      expect(analysis.historicalObservedPath).toHaveLength(PATTERN_LOOKBACK_OBSERVATIONS[lookback]);
    }
  });

  it("resolves an equity weekend on or before the requested reference date", () => {
    const points = history({ start: "2018-01-01", observations: 800 });
    const friday = points.find((point) => new Date(point.timestamp).getUTCDay() === 5)!;
    const saturday = new Date(Date.parse(friday.timestamp) + DAY_MS).toISOString().slice(0, 10);
    const analysis = analyzePattern("AAPL", points, { referenceDate: saturday, minimumSimilarity: 0 });
    expect(analysis.reference.requestedDate).toBe(saturday);
    expect(analysis.reference.resolvedDate).toBe(friday.timestamp.slice(0, 10));
    expect(analysis.reference.resolution).toBe("ON_OR_BEFORE");
  });

  it("is strictly no-lookahead when every value after T is changed", () => {
    const points = history({ start: "2004-01-01", observations: 5_000 });
    const referenceDate = points[3_200].timestamp.slice(0, 10);
    const baseline = analyzePattern("MSFT", points, { referenceDate, lookback: "3M", minimumSimilarity: 0 });
    const mutated = points.map((point) => point.timestamp.slice(0, 10) <= referenceDate ? { ...point } : { ...point, close: point.close * 91, adjustedClose: point.close * 0.07, high: point.high * 130, low: point.low * 0.02 });
    const repeated = analyzePattern("MSFT", mutated, { referenceDate, lookback: "3M", minimumSimilarity: 0 });
    expect(repeated.metadata.historyHash).toBe(baseline.metadata.historyHash);
    expect(repeated.historicalObservedPath).toEqual(baseline.historicalObservedPath);
    expect(repeated.matchedEvents).toEqual(baseline.matchedEvents);
    expect(repeated.probability).toEqual(baseline.probability);
  });

  it("ranks a deliberately perfect historical analogue first", () => {
    const points = history({ observations: 1_600, adjusted: true });
    const shape = Array.from({ length: 21 }, (_, index) => Math.sin(index / 3) * 0.08 + index * 0.002);
    replaceShape(points, 250, shape);
    replaceShape(points, points.length - 21, shape);
    const analysis = analyzePattern("NVDA", points, { lookback: "1M", minimumSimilarity: 0, maximumOverlap: 0 });
    expect(analysis.mostCorrelated?.startDate).toBe(points[250].timestamp.slice(0, 10));
    expect(analysis.mostCorrelated?.similarity).toBeCloseTo(100, 6);
  });

  it("combines independent similarity components and rewards identical paths", () => {
    const path = [0, 0.02, -0.01, 0.04, 0.05];
    const identical = calculatePatternSimilarity(path, [...path]);
    const inverse = calculatePatternSimilarity(path, path.map((value) => -value));
    expect(identical.score).toBe(100);
    expect(Object.values(identical.components)).toEqual([100, 100, 100, 100, 100]);
    expect(inverse.score).toBeLessThan(identical.score);
  });

  it("de-correlates overlapping candidates by the configured temporal separation", () => {
    const points = history({ observations: 2_500 });
    const analysis = analyzePattern("AAPL", points, { lookback: "1M", minimumSimilarity: 0, maximumOverlap: 0.25, topK: 20 });
    const dates = new Map(points.map((point, index) => [point.timestamp.slice(0, 10), index]));
    const indices = analysis.matchedEvents.map((match) => dates.get(match.matchEndDate)!);
    for (let left = 0; left < indices.length; left += 1) for (let right = left + 1; right < indices.length; right += 1) {
      expect(Math.abs(indices[left] - indices[right])).toBeGreaterThanOrEqual(Math.ceil(21 * 0.75));
    }
  });

  it("calculates 70/30 probabilities without a fabricated neutral split", () => {
    const probability = calculatePatternProbability([
      ...Array.from({ length: 7 }, () => ({ direction: "BULLISH" as const })),
      ...Array.from({ length: 3 }, () => ({ direction: "BEARISH" as const })),
    ]);
    expect(probability).toMatchObject({ bullish: 70, bearish: 30, neutral: 0, sampleSize: 10, denominator: "ALL_VALID_MATCHED_EVENTS" });
    expect(calculatePatternProbability([])).toMatchObject({ bullish: null, bearish: null, neutral: null, sampleSize: 0 });
  });

  it("calculates max drop and rise independently from adjusted OHLC", () => {
    const metrics = calculateOutcomeMetrics(100, [
      { date: "2020-01-02", close: 102, high: 105, low: 94 },
      { date: "2020-01-03", close: 109, high: 116, low: 101 },
      { date: "2020-01-06", close: 108, high: 111, low: 98 },
    ]);
    expect(metrics?.performance).toBeCloseTo(0.08);
    expect(metrics?.maxDrop).toBeCloseTo(-0.06);
    expect(metrics?.maxRise).toBeCloseTo(0.16);
  });

  it("assigns high robustness only to numerous, coherent, temporally diverse events", () => {
    const coherent = Array.from({ length: 20 }, (_, index) => event({ id: `high-${index}`, rank: index + 1, matchEndDate: `${2000 + index}-02-01`, outcomeEndDate: `${2000 + index}-03-01` }));
    const scattered = [
      event({ id: "low-a", similarity: 52, performance: 0.22, direction: "BULLISH" }),
      event({ id: "low-b", similarity: 48, performance: -0.25, direction: "BEARISH" }),
      event({ id: "low-c", similarity: 50, performance: 0, direction: "NEUTRAL" }),
    ];
    const high = calculatePatternRobustness(coherent, 5, 20, 0.005);
    const low = calculatePatternRobustness(scattered, 5, 20, 0.005);
    expect(high.stars).toBe(5);
    expect(high.score).toBeGreaterThanOrEqual(80);
    expect(low.score).toBeLessThan(high.score);
    expect(low.stars).toBeLessThan(5);
  });

  it("applies the versioned strength rules and keeps insufficient data distinct from weak", () => {
    const stars = (value: 5 | 4): PatternRobustness => ({ score: value === 5 ? 90 : 70, stars: value, components: { sampleAdequacy: 80, medianSimilarity: 80, outcomeConsistency: 80, dispersion: 80, temporalDiversity: 80, subsampleStability: 80 } });
    const probability = (bullish: number, bearish: number) => ({ bullish, bearish, neutral: 100 - bullish - bearish, sampleSize: 20, denominator: "ALL_VALID_MATCHED_EVENTS" as const });
    expect(classifyPatternStrength("AVAILABLE", probability(72, 28), stars(5))).toMatchObject({ classification: "STRONG", direction: "BULLISH" });
    expect(classifyPatternStrength("AVAILABLE", probability(30, 65), stars(4))).toMatchObject({ classification: "MODERATE", direction: "BEARISH" });
    expect(classifyPatternStrength("AVAILABLE", probability(55, 45), stars(4))).toMatchObject({ classification: "WEAK", direction: "BULLISH" });
    expect(classifyPatternStrength("INSUFFICIENT_SAMPLE", probability(80, 20), stars(5))).toMatchObject({ classification: "INSUFFICIENT_DATA", direction: "UNCERTAIN" });
  });
});

describe("Pattern Engine V2 asset and adjustment coverage", () => {
  it("uses adjusted price paths across an NVDA-style split", () => {
    const economic = history({ observations: 2_500 });
    const splitIndex = 1_600;
    const split = economic.map((point, index) => ({
      ...point,
      close: index < splitIndex ? point.close * 10 : point.close,
      open: index < splitIndex ? point.open * 10 : point.open,
      high: index < splitIndex ? point.high * 10 : point.high,
      low: index < splitIndex ? point.low * 10 : point.low,
      adjustedClose: point.close,
    }));
    const canonical = economic.map((point) => ({ ...point, adjustedClose: point.close }));
    const expected = analyzePattern("NVDA", canonical, { lookback: "3M", minimumSimilarity: 0 });
    const actual = analyzePattern("NVDA", split, { lookback: "3M", minimumSimilarity: 0 });
    expect(actual.metadata.adjustedPrices).toBe(true);
    expect(actual.matchedEvents).toEqual(expected.matchedEvents);
  });

  it("uses adjusted ETF history for dividend-aware SPY and QQQ paths", () => {
    for (const symbol of ["SPY", "QQQ"]) {
      const points = history({ observations: 2_500 }).map((point, index) => ({ ...point, adjustedClose: point.close * (1 + index * 0.00001) }));
      const analysis = analyzePattern(symbol, points, { assetClass: "ETF", lookback: "3M", minimumSimilarity: 0 });
      expect(analysis.assetClass).toBe("ETF");
      expect(analysis.metadata.adjustedPrices).toBe(true);
      expect(analysis.quality.status).toBe("AVAILABLE");
    }
  });

  it("keeps BTC and ETH on a 24/7 calendar including weekends", () => {
    const points = history({ start: "2017-01-01", observations: 2_000, crypto: true });
    const saturday = points.find((point) => new Date(point.timestamp).getUTCDay() === 6 && points.indexOf(point) > 1_500)!;
    for (const symbol of ["BTC-USD", "ETH-USD"]) {
      const analysis = analyzePattern(symbol, points, { assetClass: "CRYPTO", referenceDate: saturday.timestamp.slice(0, 10), minimumSimilarity: 0 });
      expect(analysis.reference.resolution).toBe("EXACT");
      expect(analysis.reference.resolvedDate).toBe(saturday.timestamp.slice(0, 10));
      expect(analysis.historicalObservedPath.some((point) => point.date && [0, 6].includes(new Date(`${point.date}T00:00:00Z`).getUTCDay()))).toBe(true);
    }
  });

  it.each([
    ["NVDA", "EQUITY"], ["AAPL", "EQUITY"], ["MSFT", "EQUITY"], ["STLAM.MI", "EQUITY"],
    ["SPY", "ETF"], ["QQQ", "ETF"], ["BTC-USD", "CRYPTO"], ["ETH-USD", "CRYPTO"],
  ] as const)("produces controlled V2 output for %s", (symbol, assetClass) => {
    const analysis = analyzePattern(symbol, history({ observations: 2_500, crypto: assetClass === "CRYPTO", adjusted: assetClass !== "CRYPTO" }), { assetClass, minimumSimilarity: 0 });
    expect(analysis.modelVersion).toBe("pattern-v2.0.0");
    expect(analysis.quality.status).toBe("AVAILABLE");
    expect(analysis.mostCorrelated?.id).toMatch(/^pat_[a-f0-9]{8}$/);
  });

  it("returns explicit insufficient states instead of invented 50/50 output", () => {
    const insufficientHistory = analyzePattern("NEWCO", history({ observations: 30 }), { lookback: "3M" });
    expect(insufficientHistory.quality.status).toBe("INSUFFICIENT_HISTORY");
    expect(insufficientHistory.probability).toMatchObject({ bullish: null, bearish: null, neutral: null });
    expect(insufficientHistory.strength.classification).toBe("INSUFFICIENT_DATA");

    const insufficientSample = analyzePattern("NEWCO", history({ observations: 400 }), { minimumSimilarity: 100, minimumSample: 5 });
    expect(["INSUFFICIENT_SAMPLE", "AVAILABLE"]).toContain(insufficientSample.quality.status);
    if (insufficientSample.quality.status === "INSUFFICIENT_SAMPLE") expect(insufficientSample.robustness.stars).toBeNull();
  });
});
