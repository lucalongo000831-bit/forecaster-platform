import { describe, expect, it } from "vitest";
import type { MarketChartPoint, MarketStructureResult, MarketStructureSwing } from "@/types";
import { technicalChartRequestSchema } from "@/schemas";
import {
  calculateCrossAssetContext,
  calculatePositionPlan,
  calculateTechnicalConfluenceV4,
  calculateTechnicalStructureV4,
  filterTechnicalRange,
} from "./index";

const DAY = 86_400_000;

function flatBars(count: number, start = Date.UTC(2024, 0, 1)): MarketChartPoint[] {
  return Array.from({ length: count }, (_, index) => ({
    timestamp: new Date(start + index * DAY).toISOString(),
    open: 100,
    high: 101,
    low: 99,
    close: 100,
    volume: 1_000,
  }));
}

function pricesFromReturns(returns: number[], start = 100) {
  return returns.reduce<number[]>((values, value) => [...values, values.at(-1)! * (1 + value)], [start]);
}

function barsFromPrices(prices: number[], start = Date.UTC(2024, 0, 1), offset = 0): MarketChartPoint[] {
  return prices.map((close, index) => ({
    timestamp: new Date(start + index * DAY + offset).toISOString(),
    open: close,
    high: close * 1.01,
    low: close * 0.99,
    close,
    volume: 1_000,
  }));
}

function swing(bars: MarketChartPoint[], index: number, confirmationIndex: number, kind: "HIGH" | "LOW", price: number): MarketStructureSwing {
  return {
    id: `swing-${kind.toLowerCase()}-${index}`,
    index,
    confirmationIndex,
    timestamp: bars[index]!.timestamp,
    confirmationTimestamp: bars[confirmationIndex]!.timestamp,
    price,
    kind,
    hierarchy: "MAJOR",
    label: kind === "HIGH" ? "H" : "L",
    prominenceAtr: 2,
  };
}

function suppliedStructure(swings: MarketStructureSwing[]): MarketStructureResult {
  return {
    status: "AVAILABLE",
    reason: null,
    state: "RANGE",
    swings,
    events: [],
    protectedHigh: null,
    protectedLow: null,
    activeRange: null,
    modelVersion: "market-structure-v1.0.0",
  };
}

describe("Technical V4 final audit — position planner", () => {
  it("recomputes long and short risk, rewards, R multiples and sizing", () => {
    const long = calculatePositionPlan({ side: "LONG", entry: 100, stop: 96, targets: [104, 108, 112], accountSize: 25_000, riskPercent: 0.8, atr: 2, fractional: false });
    expect(long).toMatchObject({ status: "VALID", risk: 4, riskPercent: 4, atrDistance: 2, riskCapital: 200, quantity: 50, wholeQuantity: 50, notional: 5_000 });
    expect(long.targets.map((target) => target.riskReward)).toEqual([1, 2, 3]);

    const short = calculatePositionPlan({ side: "SHORT", entry: 250, stop: 255, targets: [245, 240, 235], accountSize: 50_000, riskPercent: 1.5, atr: 2.5, fractional: true });
    expect(short).toMatchObject({ status: "VALID", risk: 5, riskPercent: 2, atrDistance: 2, riskCapital: 750, quantity: 150, notional: 37_500 });
    expect(short.targets.map((target) => target.riskReward)).toEqual([1, 2, 3]);
  });

  it("never presents invalid directions, zero sizing inputs or zero-reward targets as valid", () => {
    const base = { targets: [110, null, null], accountSize: 10_000, riskPercent: 1, atr: 2, fractional: false };
    expect(calculatePositionPlan({ ...base, side: "LONG", entry: 100, stop: 100 }).status).toBe("INVALID");
    expect(calculatePositionPlan({ ...base, side: "LONG", entry: 100, stop: 105 }).status).toBe("INVALID");
    expect(calculatePositionPlan({ ...base, side: "SHORT", entry: 100, stop: 95 }).status).toBe("INVALID");
    expect(calculatePositionPlan({ ...base, side: "LONG", entry: -100, stop: 95 }).status).not.toBe("VALID");
    expect(calculatePositionPlan({ ...base, side: "LONG", entry: 100, stop: 95, accountSize: 0 }).status).not.toBe("VALID");
    expect(calculatePositionPlan({ ...base, side: "LONG", entry: 100, stop: 95, riskPercent: 0 }).status).not.toBe("VALID");
    expect(calculatePositionPlan({ ...base, side: "LONG", entry: 100, stop: 95, targets: [100, null, null] }).status).toBe("INCOMPLETE");
  });

  it("supports precise fractional crypto sizing and finite large-price output", () => {
    const crypto = calculatePositionPlan({ side: "LONG", entry: 60_000, stop: 59_000, targets: [62_000], accountSize: 1_000, riskPercent: 0.5, atr: 750, fractional: true });
    expect(crypto.quantity).toBeCloseTo(0.005, 12);
    expect(crypto.notional).toBeCloseTo(300, 8);

    const large = calculatePositionPlan({ side: "LONG", entry: 1e250, stop: 9e249, targets: [1.2e250], accountSize: 1e250, riskPercent: 1, atr: 1e249, fractional: true });
    expect(large.status).toBe("VALID");
    expect(Number.isFinite(large.quantity)).toBe(true);
    expect(Number.isFinite(large.notional)).toBe(true);
  });
});

describe("Technical V4 final audit — point-in-time structure and FVG", () => {
  it("keeps an existing liquidity zone's identity and availability immutable when future equal highs arrive", () => {
    const bars = flatBars(30);
    bars[3] = { ...bars[3]!, high: 110, close: 100 };
    bars[8] = { ...bars[8]!, high: 110.05, close: 100 };
    bars[22] = { ...bars[22]!, high: 110.02, close: 100 };
    const prefixSwings = [swing(bars, 3, 5, "HIGH", 110), swing(bars, 8, 10, "HIGH", 110.05)];
    const futureSwing = swing(bars, 22, 24, "HIGH", 110.02);
    const prefix = calculateTechnicalStructureV4(bars.slice(0, 20), suppliedStructure(prefixSwings));
    const full = calculateTechnicalStructureV4(bars, suppliedStructure([...prefixSwings, futureSwing]));
    const before = prefix.liquidityZones[0];
    const after = full.liquidityZones.find((zone) => zone.id === before?.id);
    expect(before).toBeDefined();
    expect(after).toMatchObject({ id: before!.id, low: before!.low, high: before!.high, createdAt: before!.createdAt, availableAt: before!.availableAt });
  });

  it("uses ATR-aware equal-high tolerance at inside, exact and outside boundaries without duplicate zones", () => {
    const bars = flatBars(30);
    const pair = (difference: number) => calculateTechnicalStructureV4(bars, suppliedStructure([
      swing(bars, 3, 5, "HIGH", 100),
      swing(bars, 8, 10, "HIGH", 100 + difference),
    ])).liquidityZones;
    expect(pair(0.49)).toHaveLength(1);
    expect(pair(0.5)).toHaveLength(1);
    expect(pair(0.500_001)).toHaveLength(0);
    const clustered = calculateTechnicalStructureV4(bars, suppliedStructure([
      swing(bars, 3, 5, "HIGH", 100),
      swing(bars, 8, 10, "HIGH", 100.2),
      swing(bars, 13, 15, "HIGH", 99.8),
    ])).liquidityZones;
    expect(clustered).toHaveLength(1);
  });

  it("requires penetration and a close back through the zone before confirming a sweep", () => {
    const bars = flatBars(30);
    bars[3] = { ...bars[3]!, high: 110 };
    bars[8] = { ...bars[8]!, high: 110 };
    const structure = suppliedStructure([swing(bars, 3, 5, "HIGH", 110), swing(bars, 8, 10, "HIGH", 110)]);
    const zone = calculateTechnicalStructureV4(bars.slice(0, 20), structure).liquidityZones[0]!;
    bars[20] = { ...bars[20]!, high: zone.high + 1, close: zone.high + 0.5 };
    expect(calculateTechnicalStructureV4(bars.slice(0, 21), structure).sweeps).toHaveLength(0);
    bars[21] = { ...bars[21]!, high: zone.high + 1, close: zone.high - 0.5 };
    expect(calculateTechnicalStructureV4(bars.slice(0, 22), structure).sweeps).toMatchObject([{ direction: "BEARISH", timestamp: bars[21]!.timestamp }]);
  });

  it("tracks bullish FVG creation, partial fill and full fill without changing its identity", () => {
    const bars = flatBars(24);
    bars[16] = { ...bars[16]!, high: 100, low: 98 };
    bars[18] = { ...bars[18]!, open: 102.5, high: 104, low: 102, close: 103.5 };
    bars[19] = { ...bars[19]!, open: 103, high: 104, low: 102.5, close: 103 };
    bars[20] = { ...bars[20]!, open: 102, high: 103, low: 101, close: 102 };
    bars[21] = { ...bars[21]!, open: 101, high: 102, low: 99, close: 100 };
    const structure = suppliedStructure([]);
    const id = `fvg-bullish-${bars[18]!.timestamp}`;
    const open = calculateTechnicalStructureV4(bars.slice(0, 20), structure).fairValueGaps.find((gap) => gap.id === id);
    const partial = calculateTechnicalStructureV4(bars.slice(0, 21), structure).fairValueGaps.find((gap) => gap.id === id);
    const filled = calculateTechnicalStructureV4(bars.slice(0, 22), structure).fairValueGaps.find((gap) => gap.id === id);
    expect(open).toMatchObject({ status: "OPEN", filledPercent: 0, filledAt: null, low: 100, high: 102 });
    expect(partial).toMatchObject({ status: "PARTIAL", filledPercent: 50, filledAt: null, low: 100, high: 102 });
    expect(filled).toMatchObject({ status: "FILLED", filledPercent: 100, filledAt: bars[21]!.timestamp, low: 100, high: 102 });
  });

  it("uses strict three-candle inequalities at the exact FVG boundary", () => {
    const bars = flatBars(20);
    bars[16] = { ...bars[16]!, high: 100 };
    bars[18] = { ...bars[18]!, low: 100 };
    const result = calculateTechnicalStructureV4(bars, suppliedStructure([]));
    expect(result.fairValueGaps.find((gap) => gap.createdAt === bars[18]!.timestamp)).toBeUndefined();
  });

  it("does not classify a pure opening gap with no displacement body", () => {
    const bars = flatBars(30);
    bars[20] = { ...bars[20]!, open: 110, high: 110.5, low: 109.5, close: 110, volume: 10_000 };
    const result = calculateTechnicalStructureV4(bars, suppliedStructure([]));
    expect(result.displacements.some((event) => event.timestamp === bars[20]!.timestamp)).toBe(false);
  });

  it("keeps point-in-time event identity stable when future observations are appended", () => {
    const bars = Array.from({ length: 180 }, (_, index) => {
      const center = 100 + index * 0.03 + Math.sin(index / 4) * 5;
      return { timestamp: new Date(Date.UTC(2024, 0, 1) + index * DAY).toISOString(), open: center - Math.sin(index) * 0.5, high: center + 1.2, low: center - 1.2, close: center, volume: 1_000 + (index % 9) * 100 } satisfies MarketChartPoint;
    });
    const cutoff = 120;
    const before = calculateTechnicalStructureV4(bars.slice(0, cutoff));
    const after = calculateTechnicalStructureV4(bars);
    const cutoffTimestamp = bars[cutoff - 1]!.timestamp;
    const stableEvent = (event: { id: string; availableAt: string }) => event.availableAt <= cutoffTimestamp;
    expect(after.displacements.filter(stableEvent).map(({ id, direction, timestamp, score }) => ({ id, direction, timestamp, score })))
      .toEqual(before.displacements.map(({ id, direction, timestamp, score }) => ({ id, direction, timestamp, score })));
    for (const quality of before.swingQuality) expect(after.swingQuality.find((row) => row.swingId === quality.swingId)).toEqual(quality);
    for (const zone of before.liquidityZones) {
      expect(after.liquidityZones.find((row) => row.id === zone.id)).toMatchObject({ id: zone.id, low: zone.low, high: zone.high, createdAt: zone.createdAt, availableAt: zone.availableAt });
    }
  });
});

describe("Technical V4 final audit — cross-asset mathematics", () => {
  const benchmarkReturns = Array.from({ length: 80 }, (_, index) => (index % 5 - 2) * 0.002 + 0.001);

  it("calculates return correlation and beta rather than price-level correlation", () => {
    const benchmark = barsFromPrices(pricesFromReturns(benchmarkReturns));
    const asset = barsFromPrices(pricesFromReturns(benchmarkReturns.map((value) => value * 2)));
    const result = calculateCrossAssetContext(asset, benchmark, "SPY", { timeframe: "1D", assetClass: "EQUITY" });
    expect(result.points.at(-1)?.correlation20).toBeCloseTo(1, 10);
    expect(result.points.at(-1)?.correlation60).toBeCloseTo(1, 10);
    expect(result.beta).toBeCloseTo(2, 8);
  });

  it("returns undefined beta/correlation for a constant benchmark and never fabricates missing sessions", () => {
    const asset = barsFromPrices(pricesFromReturns(benchmarkReturns));
    const constant = barsFromPrices(Array.from({ length: asset.length }, () => 100));
    const constantResult = calculateCrossAssetContext(asset, constant, "SPY", { timeframe: "1D", assetClass: "EQUITY" });
    expect(constantResult.beta).toBeNull();
    expect(constantResult.points.at(-1)?.correlation20).toBeNull();
    const sparse = constant.filter((_, index) => index % 2 === 0);
    const sparseResult = calculateCrossAssetContext(asset, sparse, "SPY", { timeframe: "1D" });
    expect(sparseResult.points).toHaveLength(sparse.length);
    expect(sparseResult.alignmentMethod).toBe("UTC_SESSION_DATE");
  });

  it("aligns different provider timestamps for the same daily or weekly session without intraday lookahead", () => {
    const prices = pricesFromReturns(benchmarkReturns);
    const asset = barsFromPrices(prices);
    const shifted = barsFromPrices(prices, Date.UTC(2024, 0, 1), 12 * 60 * 60 * 1_000);
    const daily = calculateCrossAssetContext(asset, shifted, "QQQ", { timeframe: "1D" });
    expect(daily).toMatchObject({ status: "AVAILABLE", alignmentMethod: "UTC_SESSION_DATE" });
    expect(daily.points).toHaveLength(asset.length);
    expect(daily.points[0]?.timestamp).toBe(shifted[0]?.timestamp);
    expect(calculateCrossAssetContext(asset, shifted, "QQQ", { timeframe: "1h" })).toMatchObject({ status: "INSUFFICIENT_DATA", alignmentMethod: "EXACT_TIMESTAMP" });

    const weeklyAsset = asset.map((bar, index) => ({ ...bar, timestamp: new Date(Date.UTC(2024, 0, 1) + index * 7 * DAY).toISOString() }));
    const weeklyBenchmark = weeklyAsset.map((bar) => ({ ...bar, timestamp: new Date(Date.parse(bar.timestamp) + 2 * DAY).toISOString() }));
    const weekly = calculateCrossAssetContext(weeklyAsset, weeklyBenchmark, "QQQ", { timeframe: "1W" });
    expect(weekly).toMatchObject({ status: "AVAILABLE", alignmentMethod: "UTC_ISO_WEEK" });
    expect(weekly.points).toHaveLength(weeklyAsset.length);
  });

  it("uses crypto-aware annualization and reports the chosen observation basis", () => {
    const benchmark = barsFromPrices(pricesFromReturns(benchmarkReturns));
    const asset = barsFromPrices(pricesFromReturns(benchmarkReturns.map((value) => value * 1.2)));
    const result = calculateCrossAssetContext(asset, benchmark, "BTC-USD", { timeframe: "1D", assetClass: "CRYPTO" });
    expect(result.annualizationPeriods).toBe(365);
    const realized = Math.sqrt(benchmarkReturns.reduce((sum, value) => sum + (value - benchmarkReturns.reduce((a, b) => a + b, 0) / benchmarkReturns.length) ** 2, 0) / (benchmarkReturns.length - 1));
    expect(result.benchmarkVolatility).toBeCloseTo(realized * Math.sqrt(365), 10);
  });
});

describe("Technical V4 final audit — historical selection and confluence", () => {
  it("keeps nested range containment and exact YTD UTC boundaries", () => {
    const now = new Date("2026-09-14T12:00:00.000Z");
    const bars = flatBars(5_000, Date.UTC(2013, 0, 1));
    const oneYear = filterTechnicalRange(bars, "1Y", now);
    const fiveYears = filterTechnicalRange(bars, "5Y", now);
    const tenYears = filterTechnicalRange(bars, "10Y", now);
    const maximum = filterTechnicalRange(bars, "MAX", now);
    expect(maximum.length).toBeGreaterThan(tenYears.length);
    expect(tenYears.length).toBeGreaterThan(fiveYears.length);
    expect(fiveYears.length).toBeGreaterThan(oneYear.length);
    expect(filterTechnicalRange(bars, "YTD", now)[0]?.timestamp.slice(0, 10)).toBe("2026-01-01");
  });

  it("supports a one-day custom selection and rejects reversed or future-only selections", () => {
    const now = new Date("2026-09-14T12:00:00.000Z");
    const bars = flatBars(20, Date.UTC(2026, 8, 1));
    expect(filterTechnicalRange(bars, "CUSTOM", now, { from: "2026-09-10", to: "2026-09-10" })).toHaveLength(1);
    expect(filterTechnicalRange(bars, "CUSTOM", now, { from: "2026-09-11", to: "2026-09-10" })).toEqual([]);
    expect(filterTechnicalRange(bars, "CUSTOM", now, { from: "2026-10-01", to: "2026-10-02" })).toEqual([]);
    expect(technicalChartRequestSchema.parse({ symbol: "NVDA", timeframe: "1D", from: "2026-09-10", to: "2026-09-10" })).toMatchObject({ from: "2026-09-10", to: "2026-09-10" });
  });

  it("keeps descriptive confluence bounded with missing and conflicting factors", () => {
    const empty = calculateTechnicalConfluenceV4({ structure: null, advanced: null, divergences: null, crossAsset: null });
    expect(empty).toMatchObject({ status: "PARTIAL", score: 50, disclosure: "DESCRIPTIVE_NOT_PROBABILITY" });
    expect(empty.score).toBeGreaterThanOrEqual(0);
    expect(empty.score).toBeLessThanOrEqual(100);
  });
});
