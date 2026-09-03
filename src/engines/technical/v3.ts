import type {
  MarketChartPoint,
  MarketStructureResult,
  MarketStructureState,
  MarketStructureSwing,
  MtfStructureRow,
  MtfTechnicalLevel,
  RangedVolumeProfileResult,
  TechnicalConfluenceV2,
  TechnicalDivergence,
  TechnicalDivergenceIndicator,
  TechnicalDivergenceResult,
  TechnicalLevelStatus,
  TechnicalSessionAnalytics,
  TechnicalTimeframe,
  VolumeProfileResult,
} from "@/types";
import { calculateIndicatorSeries, sanitizeTechnicalBars } from "./terminal";
import { calculateTechnicalLevels, calculateVolumeProfile, detectSwingPoints } from "./v2";

export const MARKET_STRUCTURE_MODEL_VERSION = "market-structure-v1.0.0" as const;
export const MTF_TECHNICAL_LEVELS_MODEL_VERSION = "mtf-technical-levels-v1.0.0" as const;
export const TECHNICAL_DIVERGENCE_MODEL_VERSION = "technical-divergence-v1.0.0" as const;
export const TECHNICAL_CONFLUENCE_V2_MODEL_VERSION = "technical-confluence-v2.0.0" as const;

const TIMEFRAME_WEIGHTS: Partial<Record<TechnicalTimeframe, number>> = {
  "1m": 0.5,
  "5m": 0.65,
  "15m": 0.8,
  "30m": 0.9,
  "1h": 1,
  "4h": 1.3,
  "1D": 1.7,
  "1W": 2.1,
};

function confidence(value: number): "LOW" | "MEDIUM" | "HIGH" {
  return value >= 70 ? "HIGH" : value >= 45 ? "MEDIUM" : "LOW";
}

function classifyStructure(swings: MarketStructureSwing[], latestAtr: number, latestClose: number): MarketStructureState {
  const highs = swings.filter((swing) => swing.kind === "HIGH");
  const lows = swings.filter((swing) => swing.kind === "LOW");
  if (highs.length < 2 || lows.length < 2) return "INSUFFICIENT_DATA";
  const high = highs.at(-1)!;
  const low = lows.at(-1)!;
  if (high.label === "HH" && low.label === "HL") return "UPTREND";
  if (high.label === "LH" && low.label === "LL") return "DOWNTREND";
  if (["H", "L"].includes(high.label) && ["H", "L"].includes(low.label)) return "RANGE";
  const recent = swings.slice(-6);
  const range = Math.max(...recent.map((swing) => swing.price)) - Math.min(...recent.map((swing) => swing.price));
  return range <= Math.max(latestAtr * 10, latestClose * 0.05) ? "RANGE" : "TRANSITION";
}

function structureSwings(bars: MarketChartPoint[], minorWidth: number, majorWidth: number): MarketStructureSwing[] {
  const atr = calculateIndicatorSeries(bars).atr(14);
  const majorKeys = new Set(detectSwingPoints(bars, majorWidth).map((swing) => `${swing.index}:${swing.kind}`));
  const candidates = detectSwingPoints(bars, minorWidth);
  const previous: Partial<Record<"HIGH" | "LOW", number>> = {};
  return candidates.map((swing) => {
    const start = Math.max(0, swing.index - minorWidth);
    const end = Math.min(bars.length - 1, swing.index + minorWidth);
    const window = bars.slice(start, end + 1);
    const displacement = swing.kind === "HIGH"
      ? swing.price - Math.min(...window.map((bar) => bar.low))
      : Math.max(...window.map((bar) => bar.high)) - swing.price;
    const atrValue = atr[swing.index] ?? bars[swing.index].close * 0.01;
    const prominenceAtr = displacement / Math.max(atrValue, Number.EPSILON);
    const hierarchy = majorKeys.has(`${swing.index}:${swing.kind}`) || prominenceAtr >= 1.8 ? "MAJOR" : "MINOR";
    const previousPrice = previous[swing.kind];
    const comparisonTolerance = previousPrice === undefined ? 0 : Math.max(previousPrice * 0.001, atrValue * 0.1);
    const label = previousPrice === undefined || Math.abs(swing.price - previousPrice) <= comparisonTolerance
      ? swing.kind === "HIGH" ? "H" : "L"
      : swing.kind === "HIGH" ? swing.price > previousPrice ? "HH" : "LH" : swing.price > previousPrice ? "HL" : "LL";
    previous[swing.kind] = swing.price;
    const confirmationWidth = majorKeys.has(`${swing.index}:${swing.kind}`) ? majorWidth : minorWidth;
    const confirmationIndex = Math.min(bars.length - 1, swing.index + confirmationWidth);
    return {
      id: `swing-${swing.kind.toLowerCase()}-${swing.index}`,
      index: swing.index,
      confirmationIndex,
      timestamp: swing.timestamp,
      confirmationTimestamp: bars[confirmationIndex].timestamp,
      price: swing.price,
      kind: swing.kind,
      hierarchy,
      label,
      prominenceAtr,
    } satisfies MarketStructureSwing;
  });
}

export function calculateMarketStructure(input: MarketChartPoint[], options: { asOfIndex?: number; minorWidth?: number; majorWidth?: number } = {}): MarketStructureResult {
  const clean = sanitizeTechnicalBars(input);
  const asOfIndex = Math.min(clean.length - 1, options.asOfIndex ?? clean.length - 1);
  const bars = clean.slice(0, Math.max(0, asOfIndex + 1));
  const minorWidth = options.minorWidth ?? 2;
  const majorWidth = options.majorWidth ?? 4;
  const unavailable = (reason: string): MarketStructureResult => ({ status: "UNAVAILABLE", reason, state: "INSUFFICIENT_DATA", swings: [], events: [], protectedHigh: null, protectedLow: null, activeRange: null, modelVersion: MARKET_STRUCTURE_MODEL_VERSION });
  if (![minorWidth, majorWidth].every((width) => Number.isInteger(width) && width >= 1) || majorWidth < minorWidth) return unavailable("INVALID_CONFIGURATION");
  if (bars.length < majorWidth * 2 + 8) return unavailable("INSUFFICIENT_HISTORY");
  const swings = structureSwings(bars, minorWidth, majorWidth);
  const major = swings.filter((swing) => swing.hierarchy === "MAJOR");
  const structural = major.length >= 4 ? major : swings;
  const atr = calculateIndicatorSeries(bars).atr(14);
  const events: MarketStructureResult["events"] = [];
  const broken = new Set<string>();
  for (let barIndex = 1; barIndex < bars.length; barIndex += 1) {
    const available = structural.filter((swing) => swing.confirmationIndex <= barIndex);
    const latestHigh = available.filter((swing) => swing.kind === "HIGH").at(-1);
    const latestLow = available.filter((swing) => swing.kind === "LOW").at(-1);
    if (!latestHigh || !latestLow) continue;
    const stateBefore = classifyStructure(available, atr[barIndex] ?? bars[barIndex].close * 0.01, bars[barIndex].close);
    const previousClose = bars[barIndex - 1].close;
    const close = bars[barIndex].close;
    let level: MarketStructureSwing | undefined;
    let type: "BOS" | "CHOCH" | undefined;
    let direction: "BULLISH" | "BEARISH" | undefined;
    if (stateBefore === "UPTREND" && previousClose >= latestLow.price && close < latestLow.price) {
      level = latestLow; type = "CHOCH"; direction = "BEARISH";
    } else if (stateBefore === "DOWNTREND" && previousClose <= latestHigh.price && close > latestHigh.price) {
      level = latestHigh; type = "CHOCH"; direction = "BULLISH";
    } else if (stateBefore === "UPTREND" && previousClose <= latestHigh.price && close > latestHigh.price) {
      level = latestHigh; type = "BOS"; direction = "BULLISH";
    } else if (stateBefore === "DOWNTREND" && previousClose >= latestLow.price && close < latestLow.price) {
      level = latestLow; type = "BOS"; direction = "BEARISH";
    }
    if (!level || !type || !direction || broken.has(`${type}:${level.id}`)) continue;
    broken.add(`${type}:${level.id}`);
    const distanceAtr = Math.abs(close - level.price) / Math.max(atr[barIndex] ?? close * 0.01, Number.EPSILON);
    events.push({
      id: `${type.toLowerCase()}-${direction.toLowerCase()}-${barIndex}-${level.id}`,
      type,
      direction,
      timestamp: bars[barIndex].timestamp,
      price: level.price,
      confirmationTimestamp: bars[barIndex].timestamp,
      availableAt: bars[barIndex].timestamp,
      swingId: level.id,
      confidence: confidence(Math.min(100, 40 + distanceAtr * 25 + Math.min(25, level.prominenceAtr * 8))),
      structureBefore: stateBefore,
      structureAfter: type === "CHOCH" ? "TRANSITION" : stateBefore,
      modelVersion: MARKET_STRUCTURE_MODEL_VERSION,
    });
  }
  const latestAtr = atr.at(-1) ?? bars.at(-1)!.close * 0.01;
  const state = classifyStructure(structural, latestAtr, bars.at(-1)!.close);
  const protectedLow = state === "UPTREND" ? structural.filter((swing) => swing.kind === "LOW").at(-1) ?? null : null;
  const protectedHigh = state === "DOWNTREND" ? structural.filter((swing) => swing.kind === "HIGH").at(-1) ?? null : null;
  const recentHigh = structural.filter((swing) => swing.kind === "HIGH").at(-1);
  const recentLow = structural.filter((swing) => swing.kind === "LOW").at(-1);
  return {
    status: swings.length ? "AVAILABLE" : "UNAVAILABLE",
    reason: swings.length ? null : "NO_CONFIRMED_SWINGS",
    state,
    swings,
    events,
    protectedHigh,
    protectedLow,
    activeRange: recentHigh && recentLow ? { high: recentHigh.price, low: recentLow.price } : null,
    modelVersion: MARKET_STRUCTURE_MODEL_VERSION,
  };
}

export function calculateMtfStructure(input: Partial<Record<TechnicalTimeframe, MarketChartPoint[]>>): MtfStructureRow[] {
  return (["15m", "1h", "4h", "1D"] as TechnicalTimeframe[]).map((timeframe) => {
    const bars = input[timeframe] ?? [];
    const result = calculateMarketStructure(bars);
    return { timeframe, state: result.state, protectedHigh: result.protectedHigh?.price ?? null, protectedLow: result.protectedLow?.price ?? null, asOf: sanitizeTechnicalBars(bars).at(-1)?.timestamp ?? null };
  });
}

interface WeightedLevel {
  timeframe: TechnicalTimeframe;
  weight: number;
  type: "SUPPORT" | "RESISTANCE";
  low: number;
  high: number;
  center: number;
  score: number;
  touches: number;
  status: TechnicalLevelStatus;
}

export function calculateMtfTechnicalLevels(input: Partial<Record<TechnicalTimeframe, MarketChartPoint[]>>, options: { asOf?: Partial<Record<TechnicalTimeframe, number>>; maxZones?: number } = {}): MtfTechnicalLevel[] {
  const rows: WeightedLevel[] = [];
  for (const [timeframe, source] of Object.entries(input) as Array<[TechnicalTimeframe, MarketChartPoint[]]>) {
    const weight = TIMEFRAME_WEIGHTS[timeframe] ?? 1;
    calculateTechnicalLevels(source, { asOfIndex: options.asOf?.[timeframe], maxPerSide: 5 }).forEach((level) => rows.push({ timeframe, weight, type: level.type, low: level.priceLow, high: level.priceHigh, center: level.centerPrice, score: level.score, touches: level.touches, status: level.status }));
  }
  const clusters: WeightedLevel[][] = [];
  for (const level of rows.sort((left, right) => left.center - right.center || left.timeframe.localeCompare(right.timeframe))) {
    const target = clusters.find((cluster) => {
      if (cluster[0].type !== level.type) return false;
      const center = cluster.reduce((sum, item) => sum + item.center * item.weight, 0) / cluster.reduce((sum, item) => sum + item.weight, 0);
      const zoneWidth = Math.max(...cluster.map((item) => item.high)) - Math.min(...cluster.map((item) => item.low));
      return Math.abs(level.center - center) <= Math.max(center * 0.004, zoneWidth * 1.5, level.high - level.low);
    });
    if (target) target.push(level); else clusters.push([level]);
  }
  return clusters.map((cluster, index) => {
    const totalWeight = cluster.reduce((sum, item) => sum + item.weight, 0);
    const timeframes = [...new Set(cluster.map((item) => item.timeframe))].sort((left, right) => (TIMEFRAME_WEIGHTS[right] ?? 1) - (TIMEFRAME_WEIGHTS[left] ?? 1));
    const centerPrice = cluster.reduce((sum, item) => sum + item.center * item.weight, 0) / totalWeight;
    const score = Math.round(Math.min(100, cluster.reduce((sum, item) => sum + item.score * item.weight, 0) / totalWeight + Math.max(0, timeframes.length - 1) * 8));
    const statusPriority: TechnicalLevelStatus[] = ["TESTING", "FLIPPED", "ACTIVE", "BROKEN", "STALE"];
    return {
      id: `mtf-${cluster[0].type.toLowerCase()}-${Math.round(centerPrice * 1_000_000)}-${index}`,
      type: cluster[0].type,
      priceLow: Math.min(...cluster.map((item) => item.low)),
      priceHigh: Math.max(...cluster.map((item) => item.high)),
      centerPrice,
      timeframes,
      touches: cluster.reduce((sum, item) => sum + item.touches, 0),
      score,
      higherTimeframeWeight: Math.max(...cluster.map((item) => item.weight)),
      confluenceCount: timeframes.length,
      status: statusPriority.find((status) => cluster.some((item) => item.status === status)) ?? "ACTIVE",
      modelVersion: MTF_TECHNICAL_LEVELS_MODEL_VERSION,
    } satisfies MtfTechnicalLevel;
  }).sort((left, right) => right.score - left.score || right.confluenceCount - left.confluenceCount || left.centerPrice - right.centerPrice).slice(0, options.maxZones ?? 8);
}

function rangedProfile(input: MarketChartPoint[], kind: "FIXED" | "ANCHORED", startTimestamp: string, endTimestamp: string | undefined, binCount: number, valueAreaPercent: number): RangedVolumeProfileResult {
  const start = Date.parse(startTimestamp);
  const end = endTimestamp ? Date.parse(endTimestamp) : Number.POSITIVE_INFINITY;
  const invalid: VolumeProfileResult = { status: "UNAVAILABLE", reason: "INVALID_RANGE", bins: [], poc: null, vah: null, val: null, totalVolume: 0, valueAreaPercent, methodology: "UNIFORM_BAR_RANGE_ALLOCATION", modelVersion: "volume-profile-v1.0.0" };
  if (!Number.isFinite(start) || !(Number.isFinite(end) || end === Number.POSITIVE_INFINITY) || end < start) return { ...invalid, kind, rangeStart: null, rangeEnd: null };
  const bars = sanitizeTechnicalBars(input).filter((bar) => Date.parse(bar.timestamp) >= start && Date.parse(bar.timestamp) <= end);
  const profile = calculateVolumeProfile(bars, binCount, valueAreaPercent);
  return { ...profile, kind, rangeStart: bars[0]?.timestamp ?? null, rangeEnd: bars.at(-1)?.timestamp ?? null };
}

export function calculateFixedRangeVolumeProfile(input: MarketChartPoint[], startTimestamp: string, endTimestamp: string, binCount = 24, valueAreaPercent = 0.7) {
  return rangedProfile(input, "FIXED", startTimestamp, endTimestamp, binCount, valueAreaPercent);
}

export function calculateAnchoredVolumeProfile(input: MarketChartPoint[], startTimestamp: string, endTimestamp?: string, binCount = 24, valueAreaPercent = 0.7) {
  return rangedProfile(input, "ANCHORED", startTimestamp, endTimestamp, binCount, valueAreaPercent);
}

function alignedIndicatorValue(values: Array<number | null>, index: number, kind: "HIGH" | "LOW", tolerance: number) {
  const candidates = values.slice(Math.max(0, index - tolerance), Math.min(values.length, index + tolerance + 1)).flatMap((value, offset) => value === null || !Number.isFinite(value) ? [] : [{ value, index: Math.max(0, index - tolerance) + offset }]);
  return candidates.sort((left, right) => kind === "LOW" ? left.value - right.value || Math.abs(left.index - index) - Math.abs(right.index - index) : right.value - left.value || Math.abs(left.index - index) - Math.abs(right.index - index))[0] ?? null;
}

function divergenceForIndicator(bars: MarketChartPoint[], values: Array<number | null>, indicator: TechnicalDivergenceIndicator, pivotWidth: number, tolerance: number): TechnicalDivergence[] {
  const swings = detectSwingPoints(bars, pivotWidth);
  const result: TechnicalDivergence[] = [];
  for (const kind of ["LOW", "HIGH"] as const) {
    const pivots = swings.filter((swing) => swing.kind === kind);
    for (let index = 1; index < pivots.length; index += 1) {
      const first = pivots[index - 1];
      const second = pivots[index];
      if (second.index - first.index < pivotWidth * 2) continue;
      const firstIndicator = alignedIndicatorValue(values, first.index, kind, tolerance);
      const secondIndicator = alignedIndicatorValue(values, second.index, kind, tolerance);
      if (!firstIndicator || !secondIndicator) continue;
      const bullish = kind === "LOW" && second.price < first.price * 0.9985 && secondIndicator.value > firstIndicator.value + 0.25;
      const bearish = kind === "HIGH" && second.price > first.price * 1.0015 && secondIndicator.value < firstIndicator.value - 0.25;
      if (!bullish && !bearish) continue;
      const confirmationIndex = Math.min(bars.length - 1, Math.max(second.index + pivotWidth, secondIndicator.index));
      const priceDisplacement = Math.abs(second.price / first.price - 1) * 100;
      const oscillatorDisplacement = Math.abs(secondIndicator.value - firstIndicator.value);
      const separation = second.index - first.index;
      const strength = Math.round(Math.min(100, priceDisplacement * 12 + oscillatorDisplacement * 2 + Math.min(30, separation)));
      result.push({
        id: `${indicator.toLowerCase()}-${bullish ? "bullish" : "bearish"}-${first.index}-${second.index}`,
        type: bullish ? "REGULAR_BULLISH" : "REGULAR_BEARISH",
        indicator,
        direction: bullish ? "BULLISH" : "BEARISH",
        pricePivot1: { timestamp: first.timestamp, price: first.price, indicatorValue: firstIndicator.value, confirmationTimestamp: bars[Math.min(bars.length - 1, first.index + pivotWidth)].timestamp },
        pricePivot2: { timestamp: second.timestamp, price: second.price, indicatorValue: secondIndicator.value, confirmationTimestamp: bars[confirmationIndex].timestamp },
        indicatorPivot1: firstIndicator.value,
        indicatorPivot2: secondIndicator.value,
        confirmedAt: bars[confirmationIndex].timestamp,
        strength,
        modelVersion: TECHNICAL_DIVERGENCE_MODEL_VERSION,
      });
    }
  }
  return result.sort((left, right) => Date.parse(left.confirmedAt) - Date.parse(right.confirmedAt) || left.id.localeCompare(right.id));
}

export function calculateDivergencesFromSeries(input: MarketChartPoint[], values: Array<number | null>, indicator: TechnicalDivergenceIndicator, options: { pivotWidth?: number; alignmentTolerance?: number; asOfIndex?: number } = {}) {
  const clean = sanitizeTechnicalBars(input);
  const asOfIndex = Math.min(clean.length - 1, options.asOfIndex ?? clean.length - 1);
  const bars = clean.slice(0, Math.max(0, asOfIndex + 1));
  return divergenceForIndicator(bars, values.slice(0, bars.length), indicator, options.pivotWidth ?? 2, options.alignmentTolerance ?? 1);
}

export function calculateTechnicalDivergences(input: MarketChartPoint[], options: { asOfIndex?: number; pivotWidth?: number; alignmentTolerance?: number } = {}): TechnicalDivergenceResult {
  const clean = sanitizeTechnicalBars(input);
  const asOfIndex = Math.min(clean.length - 1, options.asOfIndex ?? clean.length - 1);
  const bars = clean.slice(0, Math.max(0, asOfIndex + 1));
  const pivotWidth = options.pivotWidth ?? 2;
  const tolerance = options.alignmentTolerance ?? 1;
  if (!Number.isInteger(pivotWidth) || pivotWidth < 1 || !Number.isInteger(tolerance) || tolerance < 0 || tolerance > pivotWidth) return { status: "UNAVAILABLE", reason: "INVALID_CONFIGURATION", divergences: [], modelVersion: TECHNICAL_DIVERGENCE_MODEL_VERSION };
  if (bars.length < 35) return { status: "UNAVAILABLE", reason: "INSUFFICIENT_HISTORY", divergences: [], modelVersion: TECHNICAL_DIVERGENCE_MODEL_VERSION };
  const indicators = calculateIndicatorSeries(bars);
  const divergences = [
    ...divergenceForIndicator(bars, indicators.rsi(14), "RSI", pivotWidth, tolerance),
    ...divergenceForIndicator(bars, indicators.macd().macd, "MACD", pivotWidth, tolerance),
  ].sort((left, right) => Date.parse(left.confirmedAt) - Date.parse(right.confirmedAt) || left.id.localeCompare(right.id));
  return { status: "AVAILABLE", reason: null, divergences, modelVersion: TECHNICAL_DIVERGENCE_MODEL_VERSION };
}

function localDate(timestamp: string, timeZone: string) {
  return new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(timestamp));
}

export function calculateSessionAnalytics(input: MarketChartPoint[], options: { assetClass?: string; timeframe: TechnicalTimeframe; timeZone?: string }): TechnicalSessionAnalytics {
  const bars = sanitizeTechnicalBars(input);
  const semantics = options.assetClass === "CRYPTO" ? "CRYPTO_24_7" : "EQUITY_SESSION";
  const unavailable = (reason: string): TechnicalSessionAnalytics => ({ status: "UNAVAILABLE", reason, semantics, previousDayHigh: null, previousDayLow: null, previousClose: null, todayOpen: null, openingRange15: null, openingRange30: null, sessionDate: null });
  if (semantics === "CRYPTO_24_7") return unavailable("CRYPTO_HAS_NO_EQUITY_OPENING_SESSION");
  if (!bars.length || ["1D", "1W", "4h", "1h"].includes(options.timeframe)) return unavailable("INTRADAY_RESOLUTION_REQUIRED");
  const zone = options.timeZone ?? "America/New_York";
  const grouped = new Map<string, MarketChartPoint[]>();
  bars.forEach((bar) => { const day = localDate(bar.timestamp, zone); grouped.set(day, [...(grouped.get(day) ?? []), bar]); });
  const days = [...grouped.keys()].sort();
  if (days.length < 2) return unavailable("PREVIOUS_SESSION_UNAVAILABLE");
  const current = grouped.get(days.at(-1)!)!;
  const previous = grouped.get(days.at(-2)!)!;
  const intervalMinutes = options.timeframe === "1m" ? 1 : options.timeframe === "5m" ? 5 : options.timeframe === "15m" ? 15 : 30;
  const openingRange = (minutes: number) => {
    if (intervalMinutes > minutes) return null;
    const count = Math.ceil(minutes / intervalMinutes);
    const sample = current.slice(0, count);
    return sample.length === count ? { high: Math.max(...sample.map((bar) => bar.high)), low: Math.min(...sample.map((bar) => bar.low)) } : null;
  };
  return { status: "AVAILABLE", reason: null, semantics, previousDayHigh: Math.max(...previous.map((bar) => bar.high)), previousDayLow: Math.min(...previous.map((bar) => bar.low)), previousClose: previous.at(-1)!.close, todayOpen: current[0].open, openingRange15: openingRange(15), openingRange30: openingRange(30), sessionDate: days.at(-1)! };
}

export function calculateTechnicalConfluenceV2(input: {
  bars: MarketChartPoint[];
  structure: MarketStructureResult;
  mtfStructure: MtfStructureRow[];
  mtfLevels: MtfTechnicalLevel[];
  profile: VolumeProfileResult;
  divergences: TechnicalDivergenceResult;
}): TechnicalConfluenceV2 {
  const bars = sanitizeTechnicalBars(input.bars);
  const reasons: string[] = [];
  const structure = input.structure.state === "UPTREND" ? "BULLISH" : input.structure.state === "DOWNTREND" ? "BEARISH" : input.structure.state === "RANGE" ? "RANGE" : input.structure.state === "TRANSITION" ? "TRANSITION" : "UNAVAILABLE";
  const availableMtf = input.mtfStructure.filter((row) => row.state !== "INSUFFICIENT_DATA");
  const directional = availableMtf.filter((row) => ["UPTREND", "DOWNTREND"].includes(row.state));
  const bullish = directional.filter((row) => row.state === "UPTREND").length;
  const bearish = directional.filter((row) => row.state === "DOWNTREND").length;
  const higherTimeframeAlignment = !availableMtf.length ? "UNAVAILABLE" : structure === "BULLISH" && bearish > bullish || structure === "BEARISH" && bullish > bearish ? "OPPOSED" : bullish > 0 && bearish > 0 ? "MIXED" : "ALIGNED";
  if (availableMtf.length) reasons.push(`Higher-timeframe structure: ${bullish} uptrend, ${bearish} downtrend, ${availableMtf.length - directional.length} non-directional.`);
  const indicators = calculateIndicatorSeries(bars);
  const rsi = indicators.rsi(14).at(-1);
  const macd = indicators.macd().histogram.at(-1);
  const momentum = typeof rsi !== "number" || typeof macd !== "number" ? "UNAVAILABLE" : rsi > 55 && macd > 0 ? "POSITIVE" : rsi < 45 && macd < 0 ? "NEGATIVE" : "NEUTRAL";
  if (typeof rsi === "number") reasons.push(`RSI ${rsi.toFixed(1)} with ${typeof macd === "number" ? `MACD histogram ${macd.toFixed(3)}` : "MACD unavailable"}.`);
  const close = bars.at(-1)?.close ?? null;
  const atr = indicators.atr(14).at(-1);
  const atrPercent = close && typeof atr === "number" ? atr / close * 100 : null;
  const volatility = atrPercent === null ? "UNAVAILABLE" : atrPercent < 1.2 ? "LOW" : atrPercent > 3 ? "HIGH" : "NORMAL";
  if (atrPercent !== null) reasons.push(`ATR is ${atrPercent.toFixed(2)}% of price.`);
  const volumeLocation = close === null || input.profile.status !== "AVAILABLE" || input.profile.poc === null || input.profile.vah === null || input.profile.val === null ? "UNAVAILABLE" : close >= input.profile.val && close <= input.profile.vah ? "AT_VALUE_AREA" : close > input.profile.poc ? "ABOVE_POC" : "BELOW_POC";
  const latestDivergence = input.divergences.divergences.at(-1);
  const divergence = input.divergences.status === "UNAVAILABLE" ? "UNAVAILABLE" : latestDivergence?.direction ?? "NONE";
  const testing = input.mtfLevels.find((level) => level.status === "TESTING");
  const keyZone = testing?.type === "SUPPORT" ? "TESTING_SUPPORT" : testing?.type === "RESISTANCE" ? "TESTING_RESISTANCE" : input.mtfLevels.length ? "NONE" : "UNAVAILABLE";
  const alignedSignals = [structure === "BULLISH" && momentum === "POSITIVE", structure === "BEARISH" && momentum === "NEGATIVE", higherTimeframeAlignment === "ALIGNED", divergence === structure].filter(Boolean).length;
  const missing = [structure, higherTimeframeAlignment, momentum, volatility, volumeLocation, divergence, keyZone].filter((value) => value === "UNAVAILABLE").length;
  return { structure, higherTimeframeAlignment, momentum, volatility, volumeLocation, divergence, keyZone, overallAlignment: missing >= 2 ? "PARTIAL" : alignedSignals >= 3 ? "HIGH" : alignedSignals >= 2 ? "MEDIUM" : "LOW", reasons, modelVersion: TECHNICAL_CONFLUENCE_V2_MODEL_VERSION };
}

export function technicalTimeframeWeight(timeframe: TechnicalTimeframe) {
  return TIMEFRAME_WEIGHTS[timeframe] ?? 1;
}
