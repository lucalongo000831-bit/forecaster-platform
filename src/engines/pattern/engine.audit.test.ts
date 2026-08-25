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
  type PatternMatchedEvent,
  type PatternRobustness,
} from ".";

const DAY_MS = 86_400_000;
const GOLDEN_IDENTITY_OBSERVATIONS = 840;

function fixtureHistory({ observations = 4_200, crypto = false, adjusted = true }: { observations?: number; crypto?: boolean; adjusted?: boolean } = {}) {
  const points: MarketChartPoint[] = [];
  let timestamp = Date.parse("2003-01-01T00:00:00.000Z");
  let close = crypto ? 500 : 60;
  while (points.length < observations) {
    const date = new Date(timestamp);
    if (crypto || ![0, 6].includes(date.getUTCDay())) {
      const index = points.length;
      close *= Math.exp(0.00018 + Math.sin(index / 13) * 0.0045 + Math.cos(index / 37) * 0.0022 + Math.sin(index / 149) * 0.001);
      points.push({
        timestamp: date.toISOString(),
        open: close * 0.998,
        high: close * (1.011 + Math.abs(Math.sin(index / 19)) * 0.004),
        low: close * (0.989 - Math.abs(Math.cos(index / 23)) * 0.003),
        close,
        adjustedClose: adjusted && !crypto ? close : undefined,
        volume: 1_000_000 + index,
      });
    }
    timestamp += DAY_MS;
  }
  return points;
}

function mean(values: number[]) {
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function median(values: number[]) {
  const ordered = [...values].sort((left, right) => left - right);
  const middle = Math.floor(ordered.length / 2);
  return ordered.length % 2 ? ordered[middle] : (ordered[middle - 1] + ordered[middle]) / 2;
}

function deviation(values: number[]) {
  const average = mean(values);
  return Math.sqrt(mean(values.map((value) => (value - average) ** 2)));
}

function clamp(value: number, minimum = 0, maximum = 100) {
  return Math.min(maximum, Math.max(minimum, value));
}

function pearson(left: number[], right: number[]) {
  const leftMean = mean(left);
  const rightMean = mean(right);
  const numerator = left.reduce((sum, value, index) => sum + (value - leftMean) * (right[index] - rightMean), 0);
  const denominator = Math.sqrt(left.reduce((sum, value) => sum + (value - leftMean) ** 2, 0) * right.reduce((sum, value) => sum + (value - rightMean) ** 2, 0));
  return denominator === 0 ? (left.every((value, index) => value === right[index]) ? 1 : 0) : numerator / denominator;
}

function slope(values: number[]) {
  const xMean = (values.length - 1) / 2;
  const yMean = mean(values);
  const numerator = values.reduce((sum, value, index) => sum + (index - xMean) * (value - yMean), 0);
  const denominator = values.reduce((sum, _value, index) => sum + (index - xMean) ** 2, 0);
  return numerator / denominator;
}

function independentSimilarity(reference: number[], candidate: number[]) {
  const referenceReturns = reference.slice(1).map((value, index) => value - reference[index]);
  const candidateReturns = candidate.slice(1).map((value, index) => value - candidate[index]);
  const correlation = ((pearson(reference, candidate) + 1) / 2) * 100;
  const rmse = Math.sqrt(mean(reference.map((value, index) => (value - candidate[index]) ** 2)));
  const shapeDistance = Math.exp(-rmse / Math.max(0.02, deviation(reference) + deviation(candidate))) * 100;
  const directionalAgreement = mean(referenceReturns.map((value, index) => Math.sign(value) === Math.sign(candidateReturns[index]) ? 1 : 0)) * 100;
  const referenceVolatility = deviation(referenceReturns);
  const candidateVolatility = deviation(candidateReturns);
  const volatilitySimilarity = Math.exp(-Math.abs(Math.log((candidateVolatility + 1e-12) / (referenceVolatility + 1e-12)))) * 100;
  const referenceSlope = slope(reference);
  const candidateSlope = slope(candidate);
  const trendScale = Math.abs(referenceSlope) + Math.abs(candidateSlope) + Math.max(referenceVolatility, candidateVolatility, 0.0001);
  const trendSimilarity = clamp((1 - Math.abs(referenceSlope - candidateSlope) / trendScale) * 100);
  return {
    score: correlation * 0.35 + shapeDistance * 0.25 + directionalAgreement * 0.15 + volatilitySimilarity * 0.15 + trendSimilarity * 0.10,
    components: { correlation, shapeDistance, directionalAgreement, volatilitySimilarity, trendSimilarity },
  };
}

function matchedEvent(overrides: Partial<PatternMatchedEvent> = {}): PatternMatchedEvent {
  return {
    id: "audit-event",
    rank: 1,
    startDate: "2001-01-02",
    matchEndDate: "2001-02-01",
    outcomeEndDate: "2001-03-02",
    similarity: 82,
    similarityComponents: { correlation: 82, shapeDistance: 82, directionalAgreement: 82, volatilitySimilarity: 82, trendSimilarity: 82 },
    direction: "BULLISH",
    performance: 0.08,
    maxDrop: -0.03,
    maxRise: 0.12,
    neutralThreshold: 0.005,
    normalizedFuturePath: [{ observation: 0, date: null, value: 0 }, { observation: 1, date: "2001-02-02", value: 0.01 }],
    observations: 21,
    ...overrides,
  };
}

function robustness(stars: 4 | 5): PatternRobustness {
  return { score: stars === 5 ? 88 : 74, stars, components: { sampleAdequacy: 80, medianSimilarity: 80, outcomeConsistency: 80, dispersion: 80, temporalDiversity: 80, subsampleStability: 80 } };
}

function probability(bullish: number, bearish: number, neutral = 100 - bullish - bearish) {
  return { bullish, bearish, neutral, sampleSize: 20, denominator: "ALL_VALID_MATCHED_EVENTS" as const };
}

describe("Pattern V2 final independent quantitative audit", () => {
  it("uses exact 1M, 3M and 6M membership dimensions", () => {
    const points = fixtureHistory();
    for (const lookback of ["1M", "3M", "6M"] as const) {
      const result = analyzePattern("NVDA", points, { lookback, minimumSimilarity: 0 });
      const expected = PATTERN_LOOKBACK_OBSERVATIONS[lookback];
      expect(result.lookbackObservations).toBe(expected);
      expect(result.outcomeObservations).toBe(expected);
      expect(result.historicalObservedPath).toHaveLength(expected);
      expect(result.matchedEvents.every((event) => event.observations === expected && event.normalizedFuturePath.length === expected + 1)).toBe(true);
    }
  });

  it("changes every as-of identity coherently between latest and historical references", () => {
    const points = fixtureHistory();
    const historicalDate = points.at(-420)!.timestamp.slice(0, 10);
    const latest = analyzePattern("AAPL", points, { lookback: "3M", minimumSimilarity: 0 });
    const historical = analyzePattern("AAPL", points, { lookback: "3M", referenceDate: historicalDate, minimumSimilarity: 0 });
    expect(historical.reference.resolvedDate).toBe(historicalDate);
    expect(historical.reference.latestAvailableDate).toBe(latest.reference.latestAvailableDate);
    expect(historical.reference.resolvedDate).not.toBe(latest.reference.resolvedDate);
    expect(historical.metadata.historyHash).not.toBe(latest.metadata.historyHash);
    expect(historical.metadata.configurationHash).not.toBe(latest.metadata.configurationHash);
    expect(historical.historicalObservedPath.at(-1)?.date).toBe(historicalDate);
    expect(historical.historicalObservedPath).not.toEqual(latest.historicalObservedPath);
    expect(historical.reference.nextValidDate).not.toBeNull();
    expect(latest.reference.nextValidDate).toBeNull();
  });

  it.each(["1M", "3M", "6M"] as const)("is strictly no-lookahead for %s", (lookback) => {
    const points = fixtureHistory({ observations: 5_000 });
    const referenceDate = points.at(-700)!.timestamp.slice(0, 10);
    const baseline = analyzePattern("MSFT", points, { lookback, referenceDate, minimumSimilarity: 0 });
    const mutated = points.map((point) => point.timestamp.slice(0, 10) <= referenceDate ? { ...point } : {
      ...point,
      open: point.open * 17,
      high: point.high * 31,
      low: point.low * 0.03,
      close: point.close * 29,
      adjustedClose: (point.adjustedClose ?? point.close) * 0.07,
      volume: (point.volume ?? 1) * 99,
    });
    const repeated = analyzePattern("MSFT", mutated, { lookback, referenceDate, minimumSimilarity: 0 });
    expect(repeated.metadata.historyHash).toBe(baseline.metadata.historyHash);
    expect(repeated.historicalObservedPath).toEqual(baseline.historicalObservedPath);
    expect(repeated.matchedEvents).toEqual(baseline.matchedEvents);
    expect(repeated.mostCorrelated).toEqual(baseline.mostCorrelated);
    expect(repeated.probability).toEqual(baseline.probability);
    expect(repeated.robustness).toEqual(baseline.robustness);
    expect(repeated.strength).toEqual(baseline.strength);
  });

  it("starts every candidate outcome strictly after its match and ends before the reference window", () => {
    const result = analyzePattern("NVDA", fixtureHistory(), { lookback: "6M", minimumSimilarity: 0 });
    expect(result.matchedEvents.length).toBeGreaterThan(0);
    for (const event of result.matchedEvents) {
      const datedPath = event.normalizedFuturePath.filter((point) => point.date !== null);
      expect(datedPath[0].date! > event.matchEndDate).toBe(true);
      expect(datedPath.at(-1)?.date).toBe(event.outcomeEndDate);
      expect(event.outcomeEndDate < result.reference.lookbackStartDate!).toBe(true);
    }
  });

  it("ranks a deliberately identical historical pattern at number one", () => {
    const points = fixtureHistory({ observations: 1_800 });
    const shape = Array.from({ length: 21 }, (_, index) => Math.sin(index / 2.7) * 0.07 + index * 0.0015);
    const inject = (start: number) => {
      const base = points[start].close;
      shape.forEach((value, offset) => {
        const close = base * Math.exp(value);
        Object.assign(points[start + offset], { open: close, high: close * 1.01, low: close * 0.99, close, adjustedClose: close });
      });
    };
    inject(260);
    inject(points.length - shape.length);
    const result = analyzePattern("NVDA", points, { lookback: "1M", minimumSimilarity: 0, maximumOverlap: 0 });
    expect(result.mostCorrelated?.startDate).toBe(points[260].timestamp.slice(0, 10));
    expect(result.mostCorrelated?.similarity).toBe(100);
  });

  it("matches an independently calculated similarity score and components", () => {
    const reference = [0, 0.013, -0.004, 0.027, 0.019, 0.051, 0.043];
    const candidate = [0, 0.011, -0.009, 0.021, 0.016, 0.046, 0.039];
    const independent = independentSimilarity(reference, candidate);
    const engine = calculatePatternSimilarity(reference, candidate);
    expect(engine.score).toBeCloseTo(independent.score, 3);
    for (const key of Object.keys(independent.components) as Array<keyof typeof independent.components>) {
      expect(engine.components[key]).toBeCloseTo(independent.components[key], 3);
    }
  });

  it.each(["1M", "3M", "6M"] as const)("penalizes overlapping %s candidates", (lookback) => {
    const points = fixtureHistory();
    const result = analyzePattern("AAPL", points, { lookback, minimumSimilarity: 0, maximumOverlap: 0.25, topK: 20 });
    const indices = new Map(points.map((point, index) => [point.timestamp.slice(0, 10), index]));
    const selected = result.matchedEvents.map((event) => indices.get(event.matchEndDate)!);
    const minimumSeparation = Math.ceil(PATTERN_LOOKBACK_OBSERVATIONS[lookback] * 0.75);
    for (let left = 0; left < selected.length; left += 1) for (let right = left + 1; right < selected.length; right += 1) {
      expect(Math.abs(selected[left] - selected[right])).toBeGreaterThanOrEqual(minimumSeparation);
    }
  });

  it("uses all valid events as the probability denominator including neutral outcomes", () => {
    const result = calculatePatternProbability([
      ...Array.from({ length: 5 }, () => ({ direction: "BULLISH" as const })),
      ...Array.from({ length: 3 }, () => ({ direction: "BEARISH" as const })),
      ...Array.from({ length: 2 }, () => ({ direction: "NEUTRAL" as const })),
    ]);
    expect(result).toEqual({ bullish: 50, bearish: 30, neutral: 20, sampleSize: 10, denominator: "ALL_VALID_MATCHED_EVENTS" });
    expect((result.bullish ?? 0) + (result.bearish ?? 0) + (result.neutral ?? 0)).toBe(100);
  });

  it("reconciles robustness components, composite score and stars independently", () => {
    const events = Array.from({ length: 10 }, (_, index) => matchedEvent({
      id: `robust-${index}`,
      rank: index + 1,
      matchEndDate: `${2001 + index}-02-01`,
      outcomeEndDate: `${2001 + index}-03-02`,
      similarity: 78 + index,
      performance: 0.075 + index * 0.001,
    }));
    const result = calculatePatternRobustness(events, 5, 20, 0.005);
    const sampleAdequacy = 100;
    const medianSimilarity = median(events.map((event) => event.similarity));
    const outcomeConsistency = 100;
    const dispersion = Math.exp(-deviation(events.map((event) => event.performance)) / Math.max(0.02, Math.abs(median(events.map((event) => event.performance))) * 2, 0.02)) * 100;
    const temporalDiversity = 100;
    const subsampleStability = 100;
    const expectedScore = sampleAdequacy * 0.20 + medianSimilarity * 0.20 + outcomeConsistency * 0.20 + dispersion * 0.15 + temporalDiversity * 0.15 + subsampleStability * 0.10;
    const expectedStars = Math.min(5, Math.max(1, Math.floor(expectedScore / 20) + 1));
    expect(result.components).toMatchObject({ sampleAdequacy, medianSimilarity, outcomeConsistency, temporalDiversity, subsampleStability });
    expect(result.components.dispersion).toBeCloseTo(dispersion, 1);
    expect(result.score).toBeCloseTo(expectedScore, 1);
    expect(result.stars).toBe(expectedStars);
  });

  it("applies monotonic strength boundaries and keeps insufficient data separate", () => {
    expect(classifyPatternStrength("AVAILABLE", probability(59.9, 40.1), robustness(5))).toMatchObject({ classification: "WEAK", direction: "BULLISH" });
    expect(classifyPatternStrength("AVAILABLE", probability(60, 40), robustness(4))).toMatchObject({ classification: "MODERATE", direction: "BULLISH" });
    expect(classifyPatternStrength("AVAILABLE", probability(69.9, 30.1), robustness(5))).toMatchObject({ classification: "MODERATE", direction: "BULLISH" });
    expect(classifyPatternStrength("AVAILABLE", probability(70, 30), robustness(4))).toMatchObject({ classification: "MODERATE", direction: "BULLISH" });
    expect(classifyPatternStrength("AVAILABLE", probability(70, 30), robustness(5))).toMatchObject({ classification: "STRONG", direction: "BULLISH" });
    expect(classifyPatternStrength("INSUFFICIENT_SAMPLE", probability(80, 20), robustness(5))).toEqual({ classification: "INSUFFICIENT_DATA", direction: "UNCERTAIN", dominantProbability: null });
  });

  it("supports a strong bearish result", () => {
    expect(classifyPatternStrength("AVAILABLE", probability(20, 75, 5), robustness(5))).toEqual({ classification: "STRONG", direction: "BEARISH", dominantProbability: 75 });
  });

  it("reconciles performance, maximum drop and maximum rise against raw OHLC math", () => {
    const future = [
      { date: "2025-01-02", close: 103, high: 107, low: 96 },
      { date: "2025-01-03", close: 98, high: 105, low: 91 },
      { date: "2025-01-06", close: 112, high: 119, low: 97 },
    ];
    const result = calculateOutcomeMetrics(100, future)!;
    expect(result.performance).toBeCloseTo(112 / 100 - 1, 6);
    expect(result.maxDrop).toBeCloseTo(91 / 100 - 1, 6);
    expect(result.maxRise).toBeCloseTo(119 / 100 - 1, 6);
    [0, 0.03, -0.02, 0.12].forEach((expected, index) => expect(result.normalizedFuturePath[index].value).toBeCloseTo(expected, 6));
  });

  it("builds Average Long and Average Short only from their respective cases", () => {
    const result = analyzePattern("NVDA", fixtureHistory(), { lookback: "1M", minimumSimilarity: 0, topK: 20 });
    for (const [direction, average] of [["BULLISH", result.averageLong], ["BEARISH", result.averageShort]] as const) {
      const selected = result.matchedEvents.filter((event) => event.direction === direction);
      expect(selected.length).toBeGreaterThan(0);
      expect(average?.sampleSize).toBe(selected.length);
      for (const point of average?.points ?? []) {
        const expected = mean(selected.map((event) => event.normalizedFuturePath[point.observation].value));
        expect(point.value).toBeCloseTo(expected, 6);
      }
    }
  });

  it("resolves equity weekends backward, keeps crypto weekends exact and never steps beyond latest", () => {
    const equity = fixtureHistory();
    const friday = equity.findLast((point) => new Date(point.timestamp).getUTCDay() === 5)!;
    const saturday = new Date(Date.parse(friday.timestamp) + DAY_MS).toISOString().slice(0, 10);
    const equityResult = analyzePattern("STLAM.MI", equity, { referenceDate: saturday, minimumSimilarity: 0 });
    expect(equityResult.reference).toMatchObject({ requestedDate: saturday, resolvedDate: friday.timestamp.slice(0, 10), resolution: "ON_OR_BEFORE" });

    const crypto = fixtureHistory({ crypto: true, adjusted: false });
    const cryptoSaturday = crypto.findLast((point) => new Date(point.timestamp).getUTCDay() === 6)!;
    const cryptoResult = analyzePattern("BTC-USD", crypto, { assetClass: "CRYPTO", referenceDate: cryptoSaturday.timestamp.slice(0, 10), minimumSimilarity: 0 });
    expect(cryptoResult.reference.resolution).toBe("EXACT");
    expect(cryptoResult.reference.resolvedDate).toBe(cryptoSaturday.timestamp.slice(0, 10));
    const latest = analyzePattern("BTC-USD", crypto, { assetClass: "CRYPTO", minimumSimilarity: 0 });
    expect(latest.reference.nextValidDate).toBeNull();
    expect(latest.reference.previousValidDate! < latest.reference.resolvedDate!).toBe(true);
  });

  it("is deterministic and isolates golden asset identities and adjustment semantics", () => {
    const golden = [
      ["NVDA", "EQUITY"], ["AAPL", "EQUITY"], ["MSFT", "EQUITY"], ["STLAM.MI", "EQUITY"],
      ["SPY", "ETF"], ["QQQ", "ETF"], ["BTC-USD", "CRYPTO"], ["ETH-USD", "CRYPTO"],
    ] as const;
    const equityFixture = fixtureHistory({ observations: GOLDEN_IDENTITY_OBSERVATIONS });
    const cryptoFixture = fixtureHistory({ observations: GOLDEN_IDENTITY_OBSERVATIONS, crypto: true, adjusted: false });
    const identities = new Set<string>();
    for (const [symbol, assetClass] of golden) {
      const baseFixture = assetClass === "CRYPTO" ? cryptoFixture : equityFixture;
      const points = baseFixture.map((point, index) => ({ ...point, close: point.close * (1 + golden.findIndex(([item]) => item === symbol) * 0.01), volume: (point.volume ?? 0) + index }));
      const first = analyzePattern(symbol, points, { assetClass, lookback: "3M", minimumSimilarity: 0 });
      const second = analyzePattern(symbol, points.map((point) => ({ ...point })), { assetClass, lookback: "3M", minimumSimilarity: 0 });
      expect(second).toEqual(first);
      expect(first.metadata.adjustedPrices).toBe(assetClass !== "CRYPTO");
      expect(first.quality.availableHistory).toMatchObject({ startDate: points[0].timestamp.slice(0, 10), endDate: points.at(-1)!.timestamp.slice(0, 10), observations: points.length });
      identities.add(`${first.symbol}:${first.metadata.historyHash}:${first.metadata.configurationHash}`);
    }
    expect(identities.size).toBe(golden.length);
  });

  it("publishes explicit insufficient states instead of fake zeroes", () => {
    const result = analyzePattern("YOUNG", fixtureHistory({ observations: 80 }), { lookback: "6M" });
    expect(result.quality.status).toBe("INSUFFICIENT_HISTORY");
    expect(result.probability).toEqual({ bullish: null, bearish: null, neutral: null, sampleSize: 0, denominator: "ALL_VALID_MATCHED_EVENTS" });
    expect(result.robustness.stars).toBeNull();
    expect(result.strength).toEqual({ classification: "INSUFFICIENT_DATA", direction: "UNCERTAIN", dominantProbability: null });
  });
});
