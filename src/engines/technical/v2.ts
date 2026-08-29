import type {
  FibonacciLevel,
  HeikinAshiPoint,
  MarketChartPoint,
  TechnicalConfluence,
  TechnicalLevel,
  VolumeProfileResult,
} from "@/types";
import { calculateIndicatorSeries, sanitizeTechnicalBars } from "./terminal";

export const TECHNICAL_LEVELS_MODEL_VERSION = "technical-levels-v1.0.0" as const;
export const VOLUME_PROFILE_MODEL_VERSION = "volume-profile-v1.0.0" as const;
export const TECHNICAL_CONFLUENCE_MODEL_VERSION = "technical-confluence-v1.0.0" as const;

export function heikinAshi(input: MarketChartPoint[]): HeikinAshiPoint[] {
  const bars = sanitizeTechnicalBars(input);
  let previousOpen: number | null = null;
  let previousClose: number | null = null;
  return bars.map((bar) => {
    const close = (bar.open + bar.high + bar.low + bar.close) / 4;
    const open = previousOpen === null || previousClose === null
      ? (bar.open + bar.close) / 2
      : (previousOpen + previousClose) / 2;
    const point: HeikinAshiPoint = {
      timestamp: bar.timestamp,
      open,
      high: Math.max(bar.high, open, close),
      low: Math.min(bar.low, open, close),
      close,
      volume: bar.volume,
      derived: true,
    };
    previousOpen = open;
    previousClose = close;
    return point;
  });
}

export const FIB_RETRACEMENT_RATIOS = [0, 0.236, 0.382, 0.5, 0.618, 0.786, 1] as const;
export const FIB_EXTENSION_RATIOS = [0.618, 1, 1.272, 1.618, 2] as const;

export function fibonacciRetracement(startPrice: number, endPrice: number): FibonacciLevel[] {
  if (![startPrice, endPrice].every(Number.isFinite)) return [];
  return FIB_RETRACEMENT_RATIOS.map((ratio) => ({ ratio, price: endPrice - (endPrice - startPrice) * ratio }));
}

export function fibonacciExtension(anchorA: number, anchorB: number, anchorC: number): FibonacciLevel[] {
  if (![anchorA, anchorB, anchorC].every(Number.isFinite)) return [];
  const impulse = anchorB - anchorA;
  return FIB_EXTENSION_RATIOS.map((ratio) => ({ ratio, price: anchorC + impulse * ratio }));
}

export function anchoredVwap(input: MarketChartPoint[], anchorTimestamp: string): Array<number | null> {
  const anchor = Date.parse(anchorTimestamp);
  if (!Number.isFinite(anchor)) return input.map(() => null);
  let cumulativeVolume = 0;
  let cumulativePriceVolume = 0;
  return input.map((bar) => {
    if (Date.parse(bar.timestamp) < anchor || !Number.isFinite(bar.volume) || bar.volume <= 0) return null;
    cumulativeVolume += bar.volume;
    cumulativePriceVolume += ((bar.high + bar.low + bar.close) / 3) * bar.volume;
    return cumulativeVolume > 0 ? cumulativePriceVolume / cumulativeVolume : null;
  });
}

export interface SwingPoint {
  index: number;
  timestamp: string;
  price: number;
  kind: "HIGH" | "LOW";
  volume: number;
  reaction: number;
}

export function detectSwingPoints(input: MarketChartPoint[], pivotWidth = 3): SwingPoint[] {
  const bars = sanitizeTechnicalBars(input);
  if (!Number.isInteger(pivotWidth) || pivotWidth < 1 || bars.length < pivotWidth * 2 + 1) return [];
  const swings: SwingPoint[] = [];
  for (let index = pivotWidth; index < bars.length - pivotWidth; index += 1) {
    const bar = bars[index];
    const surrounding = bars.slice(index - pivotWidth, index + pivotWidth + 1);
    const high = surrounding.every((candidate, offset) => offset === pivotWidth || bar.high > candidate.high);
    const low = surrounding.every((candidate, offset) => offset === pivotWidth || bar.low < candidate.low);
    const forward = bars[Math.min(index + pivotWidth, bars.length - 1)];
    if (high) swings.push({ index, timestamp: bar.timestamp, price: bar.high, kind: "HIGH", volume: bar.volume, reaction: Math.max(0, (bar.high - forward.low) / bar.high) });
    if (low) swings.push({ index, timestamp: bar.timestamp, price: bar.low, kind: "LOW", volume: bar.volume, reaction: Math.max(0, (forward.high - bar.low) / bar.low) });
  }
  return swings;
}

interface SwingCluster {
  points: SwingPoint[];
  low: number;
  high: number;
  center: number;
}

export function scoreTechnicalLevelCluster(points: SwingPoint[], barCount: number, averageVolume: number, pivotWidth: number) {
  if (!points.length || barCount < 1 || !Number.isFinite(averageVolume) || averageVolume < 0 || !Number.isInteger(pivotWidth) || pivotWidth < 1) return { score: 0, recency: 0 };
  const latest = points.reduce((current, point) => point.index > current.index ? point : current);
  const recency = 1 - Math.min(1, (barCount - 1 - latest.index) / Math.max(1, barCount));
  const touchScore = Math.min(35, points.length * 7);
  const reactionScore = Math.min(20, points.reduce((sum, point) => sum + point.reaction, 0) / points.length * 400);
  const volumeRatio = points.reduce((sum, point) => sum + point.volume, 0) / points.length / Math.max(1, averageVolume);
  const volumeScore = Math.min(15, volumeRatio * 10);
  const separated = new Set(points.map((point) => Math.floor(point.index / Math.max(2, pivotWidth)))).size;
  const separationScore = Math.min(10, separated * 2);
  return { score: Math.round(Math.min(100, touchScore + recency * 20 + reactionScore + volumeScore + separationScore)), recency };
}

export function classifyTechnicalLevel(points: SwingPoint[], current: number, zoneLow: number, zoneHigh: number, testingTolerance: number, stale: boolean): Pick<TechnicalLevel, "type" | "status"> {
  if (!points.length) return { type: current >= (zoneLow + zoneHigh) / 2 ? "SUPPORT" : "RESISTANCE", status: stale ? "STALE" : "ACTIVE" };
  const ordered = [...points].sort((left, right) => left.index - right.index);
  const earliestRole = ordered[0].kind === "LOW" ? "SUPPORT" : "RESISTANCE";
  const latestRole = ordered.at(-1)!.kind === "LOW" ? "SUPPORT" : "RESISTANCE";
  const roleChanged = points.some((point) => point.kind === "HIGH") && points.some((point) => point.kind === "LOW") && latestRole !== earliestRole;
  if (roleChanged) return { type: latestRole, status: "FLIPPED" };
  const broken = earliestRole === "SUPPORT" ? current < zoneLow : current > zoneHigh;
  if (broken) return { type: earliestRole, status: "BROKEN" };
  const testing = current >= zoneLow - testingTolerance && current <= zoneHigh + testingTolerance;
  return { type: earliestRole, status: testing ? "TESTING" : stale ? "STALE" : "ACTIVE" };
}

export function clusterSwingPoints(points: SwingPoint[], threshold: number): SwingCluster[] {
  if (!Number.isFinite(threshold) || threshold <= 0) return [];
  const clusters: SwingCluster[] = [];
  for (const point of [...points].sort((left, right) => left.price - right.price)) {
    const target = clusters.find((cluster) => Math.abs(point.price - cluster.center) <= threshold);
    if (!target) {
      clusters.push({ points: [point], low: point.price, high: point.price, center: point.price });
      continue;
    }
    target.points.push(point);
    target.low = Math.min(target.low, point.price);
    target.high = Math.max(target.high, point.price);
    target.center = target.points.reduce((sum, value) => sum + value.price, 0) / target.points.length;
  }
  return clusters;
}

export function calculateTechnicalLevels(input: MarketChartPoint[], options: { pivotWidth?: number; asOfIndex?: number; maxPerSide?: number } = {}): TechnicalLevel[] {
  const clean = sanitizeTechnicalBars(input);
  const asOfIndex = Math.min(clean.length - 1, options.asOfIndex ?? clean.length - 1);
  const bars = clean.slice(0, asOfIndex + 1);
  if (bars.length < 30) return [];
  const current = bars.at(-1)!.close;
  const indicator = calculateIndicatorSeries(bars);
  const atr = indicator.atr(14).at(-1) ?? current * 0.01;
  const threshold = Math.max(atr * 0.35, current * 0.0025, 10 ** -6);
  const swings = detectSwingPoints(bars, options.pivotWidth ?? 3);
  const clusters = clusterSwingPoints(swings, threshold);
  const averageVolume = bars.reduce((sum, bar) => sum + bar.volume, 0) / Math.max(1, bars.length);
  const levels = clusters.flatMap<TechnicalLevel>((cluster, clusterIndex) => {
    if (cluster.points.length < 2) return [];
    const ordered = [...cluster.points].sort((left, right) => left.index - right.index);
    const latest = ordered.at(-1)!;
    const earliest = ordered[0];
    const { score, recency } = scoreTechnicalLevelCluster(cluster.points, bars.length, averageVolume, options.pivotWidth ?? 3);
    if (score < 35) return [];
    const distancePct = (cluster.center / current - 1) * 100;
    const testingTolerance = Math.max(threshold * 0.15, atr, current * 0.0035);
    const { type, status } = classifyTechnicalLevel(cluster.points, current, cluster.low, cluster.high, testingTolerance, recency < 0.2);
    return [{
      id: `level-${Math.round(cluster.center * 1_000_000)}-${clusterIndex}`,
      type,
      priceLow: cluster.low - threshold * 0.15,
      priceHigh: cluster.high + threshold * 0.15,
      centerPrice: cluster.center,
      score,
      touches: cluster.points.length,
      firstTouch: earliest.timestamp,
      lastTouch: latest.timestamp,
      status,
      distancePct,
      confidence: score >= 75 ? "HIGH" : score >= 55 ? "MEDIUM" : "LOW",
      modelVersion: TECHNICAL_LEVELS_MODEL_VERSION,
    }];
  });
  const max = options.maxPerSide ?? 5;
  const ranking = (left: TechnicalLevel, right: TechnicalLevel) => right.score - left.score || Math.abs(left.distancePct) - Math.abs(right.distancePct) || left.centerPrice - right.centerPrice;
  return [
    ...levels.filter((level) => level.type === "SUPPORT").sort(ranking).slice(0, max),
    ...levels.filter((level) => level.type === "RESISTANCE").sort(ranking).slice(0, max),
  ];
}

export function calculateVolumeProfile(input: MarketChartPoint[], binCount = 24, valueAreaPercent = 0.7): VolumeProfileResult {
  const bars = sanitizeTechnicalBars(input).filter((bar) => bar.volume > 0);
  const unavailable = (reason: string): VolumeProfileResult => ({ status: "UNAVAILABLE", reason, bins: [], poc: null, vah: null, val: null, totalVolume: 0, valueAreaPercent, methodology: "UNIFORM_BAR_RANGE_ALLOCATION", modelVersion: VOLUME_PROFILE_MODEL_VERSION });
  if (!Number.isInteger(binCount) || binCount < 4 || binCount > 200 || !Number.isFinite(valueAreaPercent) || valueAreaPercent <= 0 || valueAreaPercent >= 1) return unavailable("INVALID_CONFIGURATION");
  if (bars.length < 2) return unavailable("VOLUME_UNAVAILABLE");
  const low = Math.min(...bars.map((bar) => bar.low));
  const high = Math.max(...bars.map((bar) => bar.high));
  if (!Number.isFinite(low) || !Number.isFinite(high) || high <= low) return unavailable("INVALID_PRICE_RANGE");
  const size = (high - low) / binCount;
  const volumes = Array<number>(binCount).fill(0);
  for (const bar of bars) {
    const start = Math.max(0, Math.min(binCount - 1, Math.floor((bar.low - low) / size)));
    const normalizedHigh = (bar.high - low) / size;
    const end = Math.max(start, Math.min(binCount - 1, Math.ceil(normalizedHigh - 1e-12) - 1));
    const allocation = bar.volume / (end - start + 1);
    for (let index = start; index <= end; index += 1) volumes[index] += allocation;
  }
  const totalVolume = volumes.reduce((sum, volume) => sum + volume, 0);
  const pocIndex = volumes.reduce((best, volume, index) => volume > volumes[best] ? index : best, 0);
  const selected = new Set([pocIndex]);
  let selectedVolume = volumes[pocIndex];
  let lower = pocIndex - 1;
  let upper = pocIndex + 1;
  while (selectedVolume < totalVolume * valueAreaPercent && (lower >= 0 || upper < binCount)) {
    const lowerVolume = lower >= 0 ? volumes[lower] : -1;
    const upperVolume = upper < binCount ? volumes[upper] : -1;
    const next = upperVolume > lowerVolume ? upper++ : lower--;
    selected.add(next);
    selectedVolume += volumes[next];
  }
  const bins = volumes.map((volume, index) => ({ priceLow: low + index * size, priceHigh: low + (index + 1) * size, centerPrice: low + (index + 0.5) * size, volume, valueArea: selected.has(index) }));
  const valueAreaBins = bins.filter((bin) => bin.valueArea);
  return {
    status: "AVAILABLE",
    reason: null,
    bins,
    poc: bins[pocIndex].centerPrice,
    vah: Math.max(...valueAreaBins.map((bin) => bin.priceHigh)),
    val: Math.min(...valueAreaBins.map((bin) => bin.priceLow)),
    totalVolume,
    valueAreaPercent,
    methodology: "UNIFORM_BAR_RANGE_ALLOCATION",
    modelVersion: VOLUME_PROFILE_MODEL_VERSION,
  };
}

export function calculateTechnicalConfluence(bars: MarketChartPoint[], levels: TechnicalLevel[], profile: VolumeProfileResult): TechnicalConfluence {
  const clean = sanitizeTechnicalBars(bars);
  const unavailable: TechnicalConfluence = { status: "PARTIAL", alignment: "LOW", trend: "UNAVAILABLE", momentum: "UNAVAILABLE", volatility: "UNAVAILABLE", structure: "Insufficient verified history", volume: "Volume context unavailable", reasons: [], modelVersion: TECHNICAL_CONFLUENCE_MODEL_VERSION };
  if (clean.length < 20) return unavailable;
  const engine = calculateIndicatorSeries(clean);
  const close = clean.at(-1)!.close;
  const ema20 = engine.ema(20).at(-1);
  const ema50 = engine.ema(50).at(-1);
  const rsi = engine.rsi(14).at(-1);
  const atr = engine.atr(14).at(-1);
  const reasons: string[] = [];
  const trend = typeof ema20 === "number" && typeof ema50 === "number"
    ? close > ema20 && ema20 > ema50 ? "BULLISH" : close < ema20 && ema20 < ema50 ? "BEARISH" : "NEUTRAL"
    : "UNAVAILABLE";
  if (trend !== "UNAVAILABLE") reasons.push(`Trend ${trend.toLowerCase()}: price ${close >= (ema20 ?? close) ? "above" : "below"} EMA20.`);
  const momentum = typeof rsi === "number" ? rsi > 55 ? "POSITIVE" : rsi < 45 ? "NEGATIVE" : "NEUTRAL" : "UNAVAILABLE";
  if (typeof rsi === "number") reasons.push(`RSI ${rsi.toFixed(1)} is descriptive momentum context.`);
  const atrPct = typeof atr === "number" ? atr / close * 100 : null;
  const volatility = atrPct === null ? "UNAVAILABLE" : atrPct < 1.2 ? "LOW" : atrPct > 3 ? "HIGH" : "NORMAL";
  if (atrPct !== null) reasons.push(`ATR is ${atrPct.toFixed(2)}% of price.`);
  const support = levels.filter((level) => level.type === "SUPPORT" && level.status !== "BROKEN" && level.distancePct <= 0).sort((a, b) => Math.abs(a.distancePct) - Math.abs(b.distancePct))[0];
  const resistance = levels.filter((level) => level.type === "RESISTANCE" && level.status !== "BROKEN" && level.distancePct >= 0).sort((a, b) => Math.abs(a.distancePct) - Math.abs(b.distancePct))[0];
  const structure = support || resistance ? `${support ? `Support ${Math.abs(support.distancePct).toFixed(1)}% below` : "Support unavailable"}; ${resistance ? `resistance ${Math.abs(resistance.distancePct).toFixed(1)}% above` : "resistance unavailable"}.` : "No qualified structural levels";
  const volume = profile.status === "AVAILABLE" && profile.poc !== null ? `Price ${close >= profile.poc ? "above" : "below"} estimated profile POC.` : "Volume profile unavailable";
  const directional = [trend === "BULLISH" || trend === "BEARISH", momentum === "POSITIVE" || momentum === "NEGATIVE"].filter(Boolean).length;
  const aligned = (trend === "BULLISH" && momentum === "POSITIVE") || (trend === "BEARISH" && momentum === "NEGATIVE");
  return { status: levels.length && profile.status === "AVAILABLE" ? "COMPLETE" : "PARTIAL", alignment: aligned && directional === 2 ? "HIGH" : directional ? "MEDIUM" : "LOW", trend, momentum, volatility, structure, volume, reasons, modelVersion: TECHNICAL_CONFLUENCE_MODEL_VERSION };
}
