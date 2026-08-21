import type { MarketChartPoint } from "@/types";
import {
  PATTERN_LOOKBACK_OBSERVATIONS,
  PATTERN_MODEL_VERSION,
  type PatternAnalysis,
  type PatternAssetClass,
  type PatternAveragePath,
  type PatternDirection,
  type PatternEngineOptions,
  type PatternHistoryInput,
  type PatternMatchedEvent,
  type PatternPathPoint,
  type PatternProbability,
  type PatternQuality,
  type PatternRobustness,
  type PatternSimilarityComponents,
  type PatternStatus,
} from "./types";

const DAY_MS = 86_400_000;
const EPSILON = 1e-12;
const SIMILARITY_WEIGHTS = {
  correlation: 0.35,
  shapeDistance: 0.25,
  directionalAgreement: 0.15,
  volatilitySimilarity: 0.15,
  trendSimilarity: 0.10,
} as const;

interface CanonicalBar {
  date: string;
  timestamp: string;
  close: number;
  high: number;
  low: number;
  adjusted: boolean;
}

interface RankedCandidate extends Omit<PatternMatchedEvent, "rank"> {
  matchEndIndex: number;
}

function publicMatchedEvent(candidate: RankedCandidate, rank: number): PatternMatchedEvent {
  return {
    id: candidate.id,
    rank,
    startDate: candidate.startDate,
    matchEndDate: candidate.matchEndDate,
    outcomeEndDate: candidate.outcomeEndDate,
    similarity: candidate.similarity,
    similarityComponents: candidate.similarityComponents,
    direction: candidate.direction,
    performance: candidate.performance,
    maxDrop: candidate.maxDrop,
    maxRise: candidate.maxRise,
    neutralThreshold: candidate.neutralThreshold,
    normalizedFuturePath: candidate.normalizedFuturePath,
    observations: candidate.observations,
  };
}

function clamp(value: number, minimum = 0, maximum = 100) {
  return Math.min(maximum, Math.max(minimum, value));
}

function round(value: number, digits = 6) {
  const scale = 10 ** digits;
  return Math.round(value * scale) / scale;
}

function mean(values: number[]) {
  return values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : 0;
}

function median(values: number[]) {
  if (!values.length) return 0;
  const ordered = [...values].sort((a, b) => a - b);
  const middle = Math.floor(ordered.length / 2);
  return ordered.length % 2 ? ordered[middle] : (ordered[middle - 1] + ordered[middle]) / 2;
}

function percentile(values: number[], probability: number) {
  if (!values.length) return 0;
  const ordered = [...values].sort((a, b) => a - b);
  const position = (ordered.length - 1) * probability;
  const lower = Math.floor(position);
  const remainder = position - lower;
  return ordered[lower + 1] === undefined ? ordered[lower] : ordered[lower] + remainder * (ordered[lower + 1] - ordered[lower]);
}

function standardDeviation(values: number[]) {
  if (values.length < 2) return 0;
  const average = mean(values);
  return Math.sqrt(mean(values.map((value) => (value - average) ** 2)));
}

function increments(values: number[]) {
  return values.slice(1).map((value, index) => value - values[index]);
}

function pearson(left: number[], right: number[]) {
  if (left.length !== right.length || left.length < 2) return 0;
  const leftMean = mean(left);
  const rightMean = mean(right);
  let numerator = 0;
  let leftSum = 0;
  let rightSum = 0;
  for (let index = 0; index < left.length; index += 1) {
    const leftDelta = left[index] - leftMean;
    const rightDelta = right[index] - rightMean;
    numerator += leftDelta * rightDelta;
    leftSum += leftDelta ** 2;
    rightSum += rightDelta ** 2;
  }
  if (leftSum <= EPSILON || rightSum <= EPSILON) {
    return left.every((value, index) => Math.abs(value - right[index]) <= EPSILON) ? 1 : 0;
  }
  return clamp(numerator / Math.sqrt(leftSum * rightSum), -1, 1);
}

function regressionSlope(values: number[]) {
  if (values.length < 2) return 0;
  const xMean = (values.length - 1) / 2;
  const yMean = mean(values);
  let numerator = 0;
  let denominator = 0;
  for (let index = 0; index < values.length; index += 1) {
    numerator += (index - xMean) * (values[index] - yMean);
    denominator += (index - xMean) ** 2;
  }
  return denominator > 0 ? numerator / denominator : 0;
}

function normalizedLogPath(bars: CanonicalBar[]) {
  const first = Math.log(bars[0].close);
  return bars.map((bar) => Math.log(bar.close) - first);
}

function stableHash(value: string) {
  let hash = 2_166_136_261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16_777_619);
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
}

function hashCanonicalHistory(bars: CanonicalBar[]) {
  return stableHash(bars.map((bar) => `${bar.date}:${bar.close.toFixed(8)}:${bar.high.toFixed(8)}:${bar.low.toFixed(8)}`).join("|"));
}

function canonicalize(points: MarketChartPoint[], assetClass: PatternAssetClass) {
  const byDate = new Map<string, CanonicalBar>();
  for (const point of points) {
    const timestamp = Date.parse(point.timestamp);
    if (!Number.isFinite(timestamp) || !Number.isFinite(point.close) || point.close <= 0) continue;
    const date = new Date(timestamp).toISOString().slice(0, 10);
    const useAdjustment = assetClass !== "CRYPTO" && Number.isFinite(point.adjustedClose) && (point.adjustedClose ?? 0) > 0;
    const factor = useAdjustment ? (point.adjustedClose as number) / point.close : 1;
    const close = useAdjustment ? point.adjustedClose as number : point.close;
    const high = Number.isFinite(point.high) && point.high > 0 ? point.high * factor : close;
    const low = Number.isFinite(point.low) && point.low > 0 ? point.low * factor : close;
    byDate.set(date, { date, timestamp: new Date(timestamp).toISOString(), close, high: Math.max(high, low), low: Math.min(high, low), adjusted: useAdjustment });
  }
  return [...byDate.values()].sort((left, right) => left.timestamp.localeCompare(right.timestamp));
}

export function patternHistoryIdentity(points: MarketChartPoint[], assetClass: PatternAssetClass, requestedDate?: string) {
  const allBars = canonicalize(points, assetClass);
  const requested = requestedDate ?? allBars.at(-1)?.date ?? new Date(0).toISOString().slice(0, 10);
  const requestedTime = Date.parse(`${requested}T23:59:59.999Z`);
  const referenceIndex = allBars.findLastIndex((bar) => Date.parse(bar.timestamp) <= requestedTime);
  const bars = referenceIndex >= 0 ? allBars.slice(0, referenceIndex + 1) : [];
  return { historyHash: hashCanonicalHistory(bars), resolvedDate: bars.at(-1)?.date ?? null };
}

export function calculatePatternSimilarity(referencePath: number[], candidatePath: number[]) {
  if (referencePath.length !== candidatePath.length || referencePath.length < 2) {
    return { score: 0, components: { correlation: 0, shapeDistance: 0, directionalAgreement: 0, volatilitySimilarity: 0, trendSimilarity: 0 } satisfies PatternSimilarityComponents };
  }
  const referenceReturns = increments(referencePath);
  const candidateReturns = increments(candidatePath);
  const correlation = ((pearson(referencePath, candidatePath) + 1) / 2) * 100;
  const rmse = Math.sqrt(mean(referencePath.map((value, index) => (value - candidatePath[index]) ** 2)));
  const shapeScale = Math.max(0.02, standardDeviation(referencePath) + standardDeviation(candidatePath));
  const shapeDistance = Math.exp(-rmse / shapeScale) * 100;
  const directionalAgreement = mean(referenceReturns.map((value, index) => {
    const candidate = candidateReturns[index];
    if (Math.abs(value) <= EPSILON && Math.abs(candidate) <= EPSILON) return 1;
    return Math.sign(value) === Math.sign(candidate) ? 1 : 0;
  })) * 100;
  const referenceVolatility = standardDeviation(referenceReturns);
  const candidateVolatility = standardDeviation(candidateReturns);
  const volatilitySimilarity = referenceVolatility <= EPSILON && candidateVolatility <= EPSILON
    ? 100
    : Math.exp(-Math.abs(Math.log((candidateVolatility + EPSILON) / (referenceVolatility + EPSILON)))) * 100;
  const referenceSlope = regressionSlope(referencePath);
  const candidateSlope = regressionSlope(candidatePath);
  const trendScale = Math.abs(referenceSlope) + Math.abs(candidateSlope) + Math.max(referenceVolatility, candidateVolatility, 0.0001);
  const trendSimilarity = clamp((1 - Math.abs(referenceSlope - candidateSlope) / trendScale) * 100);
  const components = { correlation, shapeDistance, directionalAgreement, volatilitySimilarity, trendSimilarity };
  const score = Object.entries(SIMILARITY_WEIGHTS).reduce((sum, [key, weight]) => sum + components[key as keyof PatternSimilarityComponents] * weight, 0);
  return { score: round(clamp(score), 4), components: Object.fromEntries(Object.entries(components).map(([key, value]) => [key, round(clamp(value), 4)])) as unknown as PatternSimilarityComponents };
}

export function classifyPatternPerformance(performance: number, neutralThreshold: number): PatternDirection {
  if (performance > neutralThreshold) return "BULLISH";
  if (performance < -neutralThreshold) return "BEARISH";
  return "NEUTRAL";
}

export function calculateOutcomeMetrics(entryPrice: number, futureBars: Array<Pick<CanonicalBar, "date" | "close" | "high" | "low">>) {
  if (!(entryPrice > 0) || !futureBars.length) return null;
  const performance = futureBars.at(-1)!.close / entryPrice - 1;
  const maxDrop = Math.min(...futureBars.map((bar) => bar.low / entryPrice - 1));
  const maxRise = Math.max(...futureBars.map((bar) => bar.high / entryPrice - 1));
  const normalizedFuturePath: PatternPathPoint[] = [
    { observation: 0, date: null, value: 0 },
    ...futureBars.map((bar, index) => ({ observation: index + 1, date: bar.date, value: bar.close / entryPrice - 1 })),
  ];
  return { performance: round(performance), maxDrop: round(maxDrop), maxRise: round(maxRise), normalizedFuturePath };
}

export function calculatePatternProbability(events: Array<Pick<PatternMatchedEvent, "direction">>): PatternProbability {
  if (!events.length) return { bullish: null, bearish: null, neutral: null, sampleSize: 0, denominator: "ALL_VALID_MATCHED_EVENTS" };
  const count = (direction: PatternDirection) => events.filter((event) => event.direction === direction).length / events.length * 100;
  return { bullish: round(count("BULLISH"), 2), bearish: round(count("BEARISH"), 2), neutral: round(count("NEUTRAL"), 2), sampleSize: events.length, denominator: "ALL_VALID_MATCHED_EVENTS" };
}

function directionalBalance(events: Array<Pick<PatternMatchedEvent, "direction">>) {
  if (!events.length) return 0;
  return (events.filter((event) => event.direction === "BULLISH").length - events.filter((event) => event.direction === "BEARISH").length) / events.length;
}

export function calculatePatternRobustness(events: PatternMatchedEvent[], minimumSample: number, topK: number, neutralThreshold: number): PatternRobustness {
  if (!events.length) return { score: 0, stars: null, components: { sampleAdequacy: 0, medianSimilarity: 0, outcomeConsistency: 0, dispersion: 0, temporalDiversity: 0, subsampleStability: 0 } };
  const sampleAdequacy = clamp(events.length / Math.max(minimumSample, Math.min(topK, minimumSample * 2)) * 100);
  const medianSimilarity = clamp(median(events.map((event) => event.similarity)));
  const counts = ["BULLISH", "BEARISH", "NEUTRAL"].map((direction) => events.filter((event) => event.direction === direction).length);
  const outcomeConsistency = Math.max(...counts) / events.length * 100;
  const performances = events.map((event) => event.performance);
  const dispersionScale = Math.max(0.02, Math.abs(median(performances)) * 2, neutralThreshold * 4);
  const dispersion = Math.exp(-standardDeviation(performances) / dispersionScale) * 100;
  const uniqueYears = new Set(events.map((event) => event.matchEndDate.slice(0, 4))).size;
  const temporalDiversity = clamp(uniqueYears / Math.min(events.length, 10) * 100);
  const chronological = [...events].sort((left, right) => left.matchEndDate.localeCompare(right.matchEndDate));
  const split = Math.ceil(chronological.length / 2);
  const subsampleStability = chronological.length < 4 ? 25 : clamp((1 - Math.abs(directionalBalance(chronological.slice(0, split)) - directionalBalance(chronological.slice(split)))) * 100);
  const components = { sampleAdequacy, medianSimilarity, outcomeConsistency, dispersion, temporalDiversity, subsampleStability };
  const score = clamp(sampleAdequacy * 0.20 + medianSimilarity * 0.20 + outcomeConsistency * 0.20 + dispersion * 0.15 + temporalDiversity * 0.15 + subsampleStability * 0.10);
  const stars = Math.min(5, Math.max(1, Math.floor(score / 20) + 1)) as 1 | 2 | 3 | 4 | 5;
  return { score: round(score, 2), stars, components: Object.fromEntries(Object.entries(components).map(([key, value]) => [key, round(clamp(value), 2)])) as unknown as PatternRobustness["components"] };
}

function averagePath(events: PatternMatchedEvent[], direction: "BULLISH" | "BEARISH"): PatternAveragePath | null {
  const selected = events.filter((event) => event.direction === direction);
  if (!selected.length) return null;
  const length = Math.min(...selected.map((event) => event.normalizedFuturePath.length));
  const points = Array.from({ length }, (_, observation) => {
    const values = selected.map((event) => event.normalizedFuturePath[observation].value);
    return { observation, date: null, value: round(mean(values)), median: round(median(values)), lowerBand: round(percentile(values, 0.25)), upperBand: round(percentile(values, 0.75)) };
  });
  return { semantic: direction === "BULLISH" ? "UNDERLYING_PATH_AFTER_BULLISH_CASES" : "UNDERLYING_PATH_AFTER_BEARISH_CASES", sampleSize: selected.length, points };
}

function historySummary(bars: CanonicalBar[]) {
  const startDate = bars[0]?.date ?? null;
  const endDate = bars.at(-1)?.date ?? null;
  const calendarDays = startDate && endDate ? Math.max(0, Math.round((Date.parse(endDate) - Date.parse(startDate)) / DAY_MS)) : 0;
  return { startDate, endDate, observations: bars.length, calendarDays, years: round(calendarDays / 365.2425, 2) };
}

function qualityFor(status: PatternStatus, bars: CanonicalBar[], candidateCount: number, validMatchCount: number, minimumSimilarity: number, topK: number): PatternQuality {
  const coverage = topK ? clamp(validMatchCount / topK * 100) : 0;
  const quality = status !== "AVAILABLE" ? "INSUFFICIENT" : validMatchCount >= 15 && coverage >= 70 ? "HIGH" : validMatchCount >= 8 ? "MEDIUM" : "LOW";
  return { status, quality, availableHistory: historySummary(bars), candidateCount, validMatchCount, minimumSimilarity, coverage: round(coverage, 2), modelVersion: PATTERN_MODEL_VERSION };
}

function referenceMetadata(allBars: CanonicalBar[], requestedDate: string, resolvedIndex: number, lookback: number) {
  const resolved = allBars[resolvedIndex];
  return {
    requestedDate,
    resolvedDate: resolved?.date ?? null,
    latestAvailableDate: allBars.at(-1)?.date ?? null,
    previousValidDate: resolvedIndex > 0 ? allBars[resolvedIndex - 1].date : null,
    nextValidDate: resolvedIndex >= 0 && resolvedIndex < allBars.length - 1 ? allBars[resolvedIndex + 1].date : null,
    lookbackStartDate: resolvedIndex >= lookback - 1 ? allBars[resolvedIndex - lookback + 1].date : null,
    entryPrice: resolved?.close ?? null,
    resolution: !resolved ? "UNAVAILABLE" as const : resolved.date === requestedDate ? "EXACT" as const : "ON_OR_BEFORE" as const,
  };
}

export function classifyPatternStrength(status: PatternStatus, probability: PatternProbability, robustness: PatternRobustness) {
  if (status !== "AVAILABLE" || probability.bullish === null || probability.bearish === null) return { classification: "INSUFFICIENT_DATA" as const, direction: "UNCERTAIN" as const, dominantProbability: null };
  const direction = probability.bullish > probability.bearish && probability.bullish > (probability.neutral ?? 0)
    ? "BULLISH" as const
    : probability.bearish > probability.bullish && probability.bearish > (probability.neutral ?? 0) ? "BEARISH" as const : "UNCERTAIN" as const;
  const dominantProbability = direction === "BULLISH" ? probability.bullish : direction === "BEARISH" ? probability.bearish : Math.max(probability.bullish, probability.bearish);
  const classification = dominantProbability >= 70 && robustness.stars === 5 ? "STRONG" as const : dominantProbability >= 60 ? "MODERATE" as const : "WEAK" as const;
  return { classification, direction, dominantProbability };
}

export function analyzePattern(symbolInput: string, history: MarketChartPoint[] | PatternHistoryInput, options: PatternEngineOptions = {}): PatternAnalysis {
  const symbol = symbolInput.trim().toUpperCase();
  const assetClass = options.assetClass ?? (symbol.endsWith("-USD") ? "CRYPTO" : "EQUITY");
  const lookback = options.lookback ?? "1M";
  const lookbackObservations = PATTERN_LOOKBACK_OBSERVATIONS[lookback];
  const outcomeObservations = lookbackObservations;
  const topK = Math.min(50, Math.max(1, options.topK ?? 20));
  const minimumSimilarity = clamp(options.minimumSimilarity ?? 55);
  const minimumSample = Math.min(topK, Math.max(3, options.minimumSample ?? 5));
  const maximumOverlap = clamp(options.maximumOverlap ?? 0.25, 0, 0.9);
  const payload = Array.isArray(history) ? { points: history } : history;
  const allBars = canonicalize(payload.points, assetClass);
  const latestDate = allBars.at(-1)?.date ?? new Date(0).toISOString().slice(0, 10);
  const requestedDate = options.referenceDate ?? latestDate;
  const requestedTime = Date.parse(`${requestedDate}T23:59:59.999Z`);
  const referenceIndex = allBars.findLastIndex((bar) => Date.parse(bar.timestamp) <= requestedTime);
  const reference = referenceMetadata(allBars, requestedDate, referenceIndex, lookbackObservations);
  const bars = referenceIndex >= 0 ? allBars.slice(0, referenceIndex + 1) : [];
  const provider = payload.provider ?? "calculated";
  const source = payload.source ?? "engine-input";
  const sourceTimestamp = payload.sourceTimestamp ?? reference.resolvedDate;
  const historyHash = hashCanonicalHistory(bars);
  const configurationHash = stableHash(`${PATTERN_MODEL_VERSION}:${symbol}:${reference.resolvedDate}:${lookback}:${topK}:${minimumSimilarity}:${minimumSample}:${maximumOverlap}`);
  const adjustedPrices = bars.some((bar) => bar.adjusted);
  const emptyProbability = calculatePatternProbability([]);
  const emptyRobustness = calculatePatternRobustness([], minimumSample, topK, 0.005);
  const emptyPath: PatternPathPoint[] = [];

  const buildAnalysis = (status: PatternStatus, matchedEvents: PatternMatchedEvent[], candidateCount: number, referencePath: PatternPathPoint[], neutralThreshold: number | null): PatternAnalysis => {
    const probability = calculatePatternProbability(matchedEvents);
    const computedRobustness = matchedEvents.length ? calculatePatternRobustness(matchedEvents, minimumSample, topK, neutralThreshold ?? 0.005) : emptyRobustness;
    const robustness = status === "AVAILABLE" ? computedRobustness : { ...computedRobustness, stars: null };
    return {
      symbol, assetClass, modelVersion: PATTERN_MODEL_VERSION, lookback, lookbackObservations, outcomeObservations, reference,
      historicalObservedPath: referencePath,
      matchedEvents,
      mostCorrelated: matchedEvents[0] ?? null,
      averageLong: averagePath(matchedEvents, "BULLISH"),
      averageShort: averagePath(matchedEvents, "BEARISH"),
      probability: matchedEvents.length ? probability : emptyProbability,
      robustness,
      strength: classifyPatternStrength(status, probability, robustness),
      quality: qualityFor(status, bars, candidateCount, matchedEvents.length, minimumSimilarity, topK),
      metadata: { provider, source, sourceTimestamp, historyHash, configurationHash, neutralThreshold, topK, minimumSample, maximumOverlap, adjustedPrices },
    };
  };

  const referenceStart = referenceIndex - lookbackObservations + 1;
  if (referenceIndex < 0 || referenceStart < 0 || bars.length < lookbackObservations + outcomeObservations + 1) {
    return buildAnalysis("INSUFFICIENT_HISTORY", [], 0, emptyPath, null);
  }

  const referenceBars = allBars.slice(referenceStart, referenceIndex + 1);
  const referenceLogPath = normalizedLogPath(referenceBars);
  const historicalObservedPath = referenceBars.map((bar, observation) => ({ observation, date: bar.date, value: round(Math.exp(referenceLogPath[observation]) - 1) }));
  const referenceVolatility = standardDeviation(increments(referenceLogPath));
  const neutralThreshold = Math.max(0.005, referenceVolatility * Math.sqrt(outcomeObservations) * 0.10);
  const candidates: RankedCandidate[] = [];
  const lastCandidateEnd = referenceStart - outcomeObservations - 1;

  for (let matchEndIndex = lookbackObservations - 1; matchEndIndex <= lastCandidateEnd; matchEndIndex += 1) {
    const startIndex = matchEndIndex - lookbackObservations + 1;
    const outcomeEndIndex = matchEndIndex + outcomeObservations;
    const candidateBars = allBars.slice(startIndex, matchEndIndex + 1);
    const futureBars = allBars.slice(matchEndIndex + 1, outcomeEndIndex + 1);
    if (candidateBars.length !== lookbackObservations || futureBars.length !== outcomeObservations) continue;
    const similarity = calculatePatternSimilarity(referenceLogPath, normalizedLogPath(candidateBars));
    if (similarity.score < minimumSimilarity) continue;
    const outcome = calculateOutcomeMetrics(allBars[matchEndIndex].close, futureBars);
    if (!outcome) continue;
    const startDate = candidateBars[0].date;
    const matchEndDate = candidateBars.at(-1)!.date;
    const outcomeEndDate = futureBars.at(-1)!.date;
    candidates.push({
      id: `pat_${stableHash(`${symbol}:${lookback}:${startDate}:${matchEndDate}:${outcomeEndDate}`)}`,
      startDate,
      matchEndDate,
      outcomeEndDate,
      similarity: similarity.score,
      similarityComponents: similarity.components,
      direction: classifyPatternPerformance(outcome.performance, neutralThreshold),
      performance: outcome.performance,
      maxDrop: outcome.maxDrop,
      maxRise: outcome.maxRise,
      neutralThreshold: round(neutralThreshold),
      normalizedFuturePath: outcome.normalizedFuturePath,
      observations: futureBars.length,
      matchEndIndex,
    });
  }

  candidates.sort((left, right) => right.similarity - left.similarity || left.matchEndDate.localeCompare(right.matchEndDate));
  const minimumSeparation = Math.max(1, Math.ceil(lookbackObservations * (1 - maximumOverlap)));
  const decorrelated: RankedCandidate[] = [];
  for (const candidate of candidates) {
    if (decorrelated.every((selected) => Math.abs(selected.matchEndIndex - candidate.matchEndIndex) >= minimumSeparation)) decorrelated.push(candidate);
    if (decorrelated.length >= topK) break;
  }
  const matchedEvents = decorrelated.map((candidate, index) => publicMatchedEvent(candidate, index + 1));
  const status: PatternStatus = matchedEvents.length >= minimumSample ? "AVAILABLE" : "INSUFFICIENT_SAMPLE";
  return buildAnalysis(status, matchedEvents, candidates.length, historicalObservedPath, neutralThreshold);
}
