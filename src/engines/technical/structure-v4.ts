import type { MarketChartPoint, MarketStructureResult, TechnicalDisplacement, TechnicalFairValueGap, TechnicalLiquiditySweep, TechnicalLiquidityZone, TechnicalStructureTimelineEvent, TechnicalStructureV4Result, TechnicalSwingQuality } from "@/types";
import { calculateMarketStructure } from "./v3";

function rollingAtr(bars: MarketChartPoint[], period = 14) {
  const values: Array<number | null> = [];
  for (let index = 0; index < bars.length; index += 1) {
    const start = Math.max(0, index - period + 1);
    const rows = bars.slice(start, index + 1).map((bar, offset) => {
      const absoluteIndex = start + offset; const previous = bars[absoluteIndex - 1]?.close ?? bar.close;
      return Math.max(bar.high - bar.low, Math.abs(bar.high - previous), Math.abs(bar.low - previous));
    });
    values.push(rows.length >= Math.min(period, index + 1) ? rows.reduce((sum, value) => sum + value, 0) / rows.length : null);
  }
  return values;
}

function swingQuality(structure: MarketStructureResult, bars: MarketChartPoint[], atr: Array<number | null>): TechnicalSwingQuality[] {
  return structure.swings.map((swing, index) => {
    const bar = bars[swing.index]; const value = atr[swing.confirmationIndex] ?? atr[swing.index] ?? 0;
    const prominence = Math.min(40, Math.max(0, swing.prominenceAtr / 3 * 40));
    const spacing = Math.min(20, Math.max(0, ((swing.index - (structure.swings[index - 1]?.index ?? Math.max(0, swing.index - 2))) / 12) * 20));
    const rejection = !bar || !value ? 0 : Math.min(20, Math.abs((swing.kind === "HIGH" ? bar.high - Math.max(bar.open, bar.close) : Math.min(bar.open, bar.close) - bar.low)) / value * 20);
    const nearby = bars.slice(Math.max(0, swing.index - 10), swing.confirmationIndex + 1); const averageVolume = nearby.reduce((sum, row) => sum + row.volume, 0) / Math.max(1, nearby.length);
    const volume = !bar || !averageVolume ? 0 : Math.min(20, bar.volume / averageVolume * 10);
    const score = Math.round(Math.min(100, prominence + spacing + rejection + volume));
    return { swingId: swing.id, score, label: score >= 70 ? "HIGH" : score >= 40 ? "MEDIUM" : "LOW", contributors: [`Prominence ${prominence.toFixed(0)}/40`, `Spacing ${spacing.toFixed(0)}/20`, `Rejection ${rejection.toFixed(0)}/20`, `Volume ${volume.toFixed(0)}/20`] };
  });
}

function liquidity(structure: MarketStructureResult, bars: MarketChartPoint[], atr: Array<number | null>) {
  const zones: TechnicalLiquidityZone[] = [];
  for (const kind of ["HIGH", "LOW"] as const) {
    const swings = structure.swings.filter((swing) => swing.kind === kind);
    for (let index = 0; index < swings.length; index += 1) {
      const seed = swings[index]!; if (zones.some((zone) => seed.price >= zone.low && seed.price <= zone.high)) continue;
      const tolerance = Math.max(seed.price * 0.0015, (atr[seed.confirmationIndex] ?? 0) * 0.25);
      const cluster = swings.slice(index).filter((swing) => Math.abs(swing.price - seed.price) <= tolerance);
      if (cluster.length < 2) continue;
      const low = Math.min(...cluster.map((swing) => swing.price)); const high = Math.max(...cluster.map((swing) => swing.price));
      const confirmed = cluster.map((swing) => swing.confirmationTimestamp).sort().at(-1)!;
      const zone: TechnicalLiquidityZone = { id: `liq-${kind.toLowerCase()}-${seed.id}`, side: kind === "HIGH" ? "BUY_SIDE" : "SELL_SIDE", low: low - tolerance * 0.15, high: high + tolerance * 0.15, touches: cluster.length, createdAt: seed.timestamp, availableAt: confirmed, status: "ACTIVE" };
      zones.push(zone);
    }
  }
  const sweeps: TechnicalLiquiditySweep[] = [];
  for (const zone of zones) {
    const after = bars.filter((bar) => bar.timestamp > zone.availableAt);
    const swept = after.find((bar) => zone.side === "BUY_SIDE" ? bar.high > zone.high && bar.close < zone.high : bar.low < zone.low && bar.close > zone.low);
    if (!swept) continue;
    zone.status = "SWEPT";
    sweeps.push({ id: `sweep-${zone.id}-${swept.timestamp}`, zoneId: zone.id, side: zone.side, direction: zone.side === "BUY_SIDE" ? "BEARISH" : "BULLISH", timestamp: swept.timestamp, price: zone.side === "BUY_SIDE" ? swept.high : swept.low, availableAt: swept.timestamp });
  }
  return { zones, sweeps };
}

function displacements(bars: MarketChartPoint[], atr: Array<number | null>): TechnicalDisplacement[] {
  return bars.flatMap((bar, index) => {
    const value = atr[index]; if (!value || index < 14) return [];
    const bodyAtr = Math.abs(bar.close - bar.open) / value; const range = Math.max(Number.EPSILON, bar.high - bar.low);
    const closeLocation = bar.close >= bar.open ? (bar.close - bar.low) / range : (bar.high - bar.close) / range;
    const prior = bars.slice(Math.max(0, index - 20), index); const averageVolume = prior.reduce((sum, row) => sum + row.volume, 0) / Math.max(1, prior.length);
    const relativeVolume = averageVolume ? bar.volume / averageVolume : null;
    const score = Math.round(Math.min(100, bodyAtr * 45 + closeLocation * 30 + Math.min(25, (relativeVolume ?? 1) * 12.5)));
    if (bodyAtr < 1.1 || closeLocation < 0.68 || score < 65) return [];
    return [{ id: `disp-${bar.timestamp}`, direction: bar.close >= bar.open ? "BULLISH" as const : "BEARISH" as const, timestamp: bar.timestamp, score, bodyAtr, relativeVolume, availableAt: bar.timestamp }];
  });
}

function fairValueGaps(bars: MarketChartPoint[]): TechnicalFairValueGap[] {
  const gaps: TechnicalFairValueGap[] = [];
  for (let index = 2; index < bars.length; index += 1) {
    const first = bars[index - 2]!; const third = bars[index]!;
    const direction = first.high < third.low ? "BULLISH" : first.low > third.high ? "BEARISH" : null;
    if (!direction) continue;
    const low = direction === "BULLISH" ? first.high : third.high; const high = direction === "BULLISH" ? third.low : first.low;
    let best = 0; let filledAt: string | null = null;
    for (const bar of bars.slice(index + 1)) {
      const progress = direction === "BULLISH" ? (high - bar.low) / (high - low) : (bar.high - low) / (high - low);
      best = Math.max(best, Math.min(1, Math.max(0, progress)));
      if (best >= 1) { filledAt = bar.timestamp; break; }
    }
    gaps.push({ id: `fvg-${direction.toLowerCase()}-${third.timestamp}`, direction, low, high, createdAt: third.timestamp, availableAt: third.timestamp, status: best >= 1 ? "FILLED" : best > 0 ? "PARTIAL" : "OPEN", filledPercent: Math.round(best * 100), filledAt });
  }
  return gaps;
}

export function calculateTechnicalStructureV4(bars: MarketChartPoint[], supplied?: MarketStructureResult): TechnicalStructureV4Result {
  const empty: TechnicalStructureV4Result = { status: "UNAVAILABLE", reason: "MINIMUM_20_BARS_REQUIRED", swingQuality: [], liquidityZones: [], sweeps: [], displacements: [], fairValueGaps: [], timeline: [], modelVersion: "technical-structure-v4.0.0" };
  if (bars.length < 20) return empty;
  const structure = supplied ?? calculateMarketStructure(bars); const atr = rollingAtr(bars);
  const { zones, sweeps } = liquidity(structure, bars, atr); const displacementRows = displacements(bars, atr); const gaps = fairValueGaps(bars);
  const timeline: TechnicalStructureTimelineEvent[] = [
    ...structure.events.map((event) => ({ id: event.id, type: event.type, direction: event.direction, timestamp: event.timestamp, price: event.price, description: `${event.type} ${event.direction.toLowerCase()} confirmed by close.`, availableAt: event.availableAt })),
    ...sweeps.map((event) => ({ id: event.id, type: "LIQUIDITY_SWEEP" as const, direction: event.direction, timestamp: event.timestamp, price: event.price, description: `${event.side.replace("_", " ")} liquidity sweep.`, availableAt: event.availableAt })),
    ...displacementRows.map((event) => ({ id: event.id, type: "DISPLACEMENT" as const, direction: event.direction, timestamp: event.timestamp, price: bars.find((bar) => bar.timestamp === event.timestamp)!.close, description: `Displacement score ${event.score}/100.`, availableAt: event.availableAt })),
    ...gaps.flatMap((gap) => [{ id: gap.id, type: "FVG_CREATED" as const, direction: gap.direction, timestamp: gap.createdAt, price: (gap.low + gap.high) / 2, description: `${gap.direction} fair value gap created.`, availableAt: gap.availableAt }, ...(gap.filledAt ? [{ id: `${gap.id}-filled`, type: "FVG_FILLED" as const, direction: gap.direction, timestamp: gap.filledAt, price: (gap.low + gap.high) / 2, description: "Fair value gap fully filled.", availableAt: gap.filledAt }] : [])]),
  ].sort((a, b) => a.timestamp.localeCompare(b.timestamp));
  return { status: "AVAILABLE", reason: null, swingQuality: swingQuality(structure, bars, atr), liquidityZones: zones, sweeps, displacements: displacementRows, fairValueGaps: gaps, timeline, modelVersion: "technical-structure-v4.0.0" };
}
