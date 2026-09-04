import { z } from "zod";
import type { MarketChartPoint } from "@/types";
import { anchoredVwap, calculateVolumeProfile } from "./v2";
import { calculateIndicatorSeries, sanitizeTechnicalBars } from "./terminal";
import { calculateMarketStructure, calculateTechnicalDivergences } from "./v3";

export const TECHNICAL_ALERT_MODEL_VERSION = "technical-alert-v1.0.0" as const;

export const TECHNICAL_ALERT_CONDITIONS = [
  "TECH_PRICE_CROSS_LEVEL",
  "TECH_PRICE_ENTER_ZONE",
  "TECH_PRICE_EXIT_ZONE",
  "TECH_BOS_CONFIRMED",
  "TECH_CHOCH_CONFIRMED",
  "TECH_RSI_CROSS",
  "TECH_MACD_CROSS_SIGNAL",
  "TECH_DIVERGENCE_BULLISH",
  "TECH_DIVERGENCE_BEARISH",
  "TECH_PRICE_CROSS_EMA",
  "TECH_PRICE_CROSS_AVWAP",
  "TECH_PRICE_CROSS_PROFILE",
] as const;

export type TechnicalAlertConditionId = typeof TECHNICAL_ALERT_CONDITIONS[number];

const direction = z.enum(["UP", "DOWN", "EITHER"]).default("EITHER");
const schemas: Record<TechnicalAlertConditionId, z.ZodType<Record<string, unknown>>> = {
  TECH_PRICE_CROSS_LEVEL: z.object({ level: z.number().positive(), direction }),
  TECH_PRICE_ENTER_ZONE: z.object({ low: z.number().positive(), high: z.number().positive() }).refine((value) => value.high >= value.low),
  TECH_PRICE_EXIT_ZONE: z.object({ low: z.number().positive(), high: z.number().positive() }).refine((value) => value.high >= value.low),
  TECH_BOS_CONFIRMED: z.object({ direction: z.enum(["BULLISH", "BEARISH", "EITHER"]).default("EITHER") }),
  TECH_CHOCH_CONFIRMED: z.object({ direction: z.enum(["BULLISH", "BEARISH", "EITHER"]).default("EITHER") }),
  TECH_RSI_CROSS: z.object({ threshold: z.number().min(0).max(100), direction }),
  TECH_MACD_CROSS_SIGNAL: z.object({ direction }),
  TECH_DIVERGENCE_BULLISH: z.object({ indicator: z.enum(["RSI", "MACD", "EITHER"]).default("EITHER") }),
  TECH_DIVERGENCE_BEARISH: z.object({ indicator: z.enum(["RSI", "MACD", "EITHER"]).default("EITHER") }),
  TECH_PRICE_CROSS_EMA: z.object({ period: z.number().int().min(2).max(250), direction }),
  TECH_PRICE_CROSS_AVWAP: z.object({ anchorTimestamp: z.iso.datetime(), direction }),
  TECH_PRICE_CROSS_PROFILE: z.object({ boundary: z.enum(["POC", "VAH", "VAL"]), binCount: z.number().int().min(4).max(200).default(24), valueAreaPercent: z.number().gt(0).lt(1).default(0.7), direction }),
};

export const TECHNICAL_ALERT_REGISTRY = {
  TECH_PRICE_CROSS_LEVEL: { label: "Price crosses level", requiredInputs: ["OHLC"] },
  TECH_PRICE_ENTER_ZONE: { label: "Price enters S/R zone", requiredInputs: ["OHLC"] },
  TECH_PRICE_EXIT_ZONE: { label: "Price exits S/R zone", requiredInputs: ["OHLC"] },
  TECH_BOS_CONFIRMED: { label: "BOS confirmed", requiredInputs: ["OHLC", "MARKET_STRUCTURE"] },
  TECH_CHOCH_CONFIRMED: { label: "CHOCH confirmed", requiredInputs: ["OHLC", "MARKET_STRUCTURE"] },
  TECH_RSI_CROSS: { label: "RSI crosses threshold", requiredInputs: ["OHLC", "RSI"] },
  TECH_MACD_CROSS_SIGNAL: { label: "MACD crosses signal", requiredInputs: ["OHLC", "MACD"] },
  TECH_DIVERGENCE_BULLISH: { label: "Bullish divergence confirmed", requiredInputs: ["OHLC", "DIVERGENCE"] },
  TECH_DIVERGENCE_BEARISH: { label: "Bearish divergence confirmed", requiredInputs: ["OHLC", "DIVERGENCE"] },
  TECH_PRICE_CROSS_EMA: { label: "Price crosses EMA", requiredInputs: ["OHLC", "EMA"] },
  TECH_PRICE_CROSS_AVWAP: { label: "Price crosses Anchored VWAP", requiredInputs: ["OHLC", "AVWAP"] },
  TECH_PRICE_CROSS_PROFILE: { label: "Price crosses POC / VAH / VAL", requiredInputs: ["OHLC", "VOLUME_PROFILE"] },
} as const satisfies Record<TechnicalAlertConditionId, { label: string; requiredInputs: readonly string[] }>;

export interface TechnicalAlertEvaluation {
  available: boolean;
  triggered: boolean;
  state: string | null;
  observed: number | string | null;
  message: string;
  reason: string | null;
  freshness: string | null;
}

export interface TechnicalAlertBatchItem {
  id: string;
  condition: TechnicalAlertConditionId;
  symbol: string;
  timeframe: string;
  parameters: unknown;
  previousState: string | null;
}

export async function evaluateTechnicalAlertBatch<T extends { bars: MarketChartPoint[]; freshness: string }>(items: TechnicalAlertBatchItem[], load: (symbol: string, timeframe: string) => Promise<T>) {
  const grouped = new Map<string, TechnicalAlertBatchItem[]>();
  items.forEach((item) => { const key = `${item.symbol.toUpperCase()}:${item.timeframe}`; grouped.set(key, [...(grouped.get(key) ?? []), item]); });
  const datasets = new Map<string, T | Error>();
  await Promise.all([...grouped.entries()].map(async ([key, records]) => {
    try { datasets.set(key, await load(records[0].symbol, records[0].timeframe)); }
    catch (error) { datasets.set(key, error instanceof Error ? error : new Error("DATA_UNAVAILABLE")); }
  }));
  return items.map((item) => {
    const dataset = datasets.get(`${item.symbol.toUpperCase()}:${item.timeframe}`);
    if (!dataset || dataset instanceof Error || ["STALE", "UNAVAILABLE"].includes(dataset.freshness)) return { id: item.id, evaluation: { available: false, triggered: false, state: item.previousState, observed: null, message: "Technical alert deferred: verified data unavailable.", reason: dataset instanceof Error ? dataset.message : `FRESHNESS_${dataset?.freshness ?? "UNAVAILABLE"}`, freshness: dataset instanceof Error ? null : dataset?.freshness ?? null } satisfies TechnicalAlertEvaluation };
    try {
      const evaluation = evaluateTechnicalAlertCondition(item.condition, item.parameters, dataset.bars, item.previousState);
      return { id: item.id, evaluation: { ...evaluation, freshness: dataset.freshness, message: `${evaluation.message} Data freshness: ${dataset.freshness}.` } };
    }
    catch { return { id: item.id, evaluation: { available: false, triggered: false, state: item.previousState, observed: null, message: "Technical alert deferred: invalid saved configuration.", reason: "INVALID_CONFIGURATION", freshness: dataset.freshness } satisfies TechnicalAlertEvaluation }; }
  });
}

function crossed(current: number, target: number, requested: "UP" | "DOWN" | "EITHER", previousState: string | null) {
  const state = current > target ? "ABOVE" : current < target ? "BELOW" : "AT";
  const up = state === "ABOVE" && (previousState === "BELOW" || previousState === "AT");
  const down = state === "BELOW" && (previousState === "ABOVE" || previousState === "AT");
  return { triggered: requested === "UP" ? up : requested === "DOWN" ? down : up || down, state, observed: current };
}

export function parseTechnicalAlertParameters(condition: TechnicalAlertConditionId, parameters: unknown) {
  return schemas[condition].parse(parameters);
}

export function evaluateTechnicalAlertCondition(condition: TechnicalAlertConditionId, parametersInput: unknown, input: MarketChartPoint[], previousState: string | null): TechnicalAlertEvaluation {
  const bars = sanitizeTechnicalBars(input);
  const unavailable = (reason: string): TechnicalAlertEvaluation => ({ available: false, triggered: false, state: previousState, observed: null, message: "Technical alert deferred: verified data unavailable.", reason, freshness: null });
  if (bars.length < 2) return unavailable("INSUFFICIENT_HISTORY");
  const parameters = parseTechnicalAlertParameters(condition, parametersInput);
  const current = bars[bars.length - 1].close;
  let evaluation: Omit<TechnicalAlertEvaluation, "available" | "message" | "reason" | "freshness"> | null = null;
  if (condition === "TECH_PRICE_CROSS_LEVEL") evaluation = crossed(current, parameters.level as number, parameters.direction as "UP" | "DOWN" | "EITHER", previousState);
  if (["TECH_PRICE_ENTER_ZONE", "TECH_PRICE_EXIT_ZONE"].includes(condition)) {
    const inside = current >= (parameters.low as number) && current <= (parameters.high as number);
    const state = inside ? "INSIDE" : "OUTSIDE";
    evaluation = { state, observed: current, triggered: previousState !== null && previousState !== state && (condition === "TECH_PRICE_ENTER_ZONE" ? inside : !inside) };
  }
  if (["TECH_BOS_CONFIRMED", "TECH_CHOCH_CONFIRMED"].includes(condition)) {
    const eventType = condition === "TECH_BOS_CONFIRMED" ? "BOS" : "CHOCH";
    const requested = parameters.direction as "BULLISH" | "BEARISH" | "EITHER";
    const event = calculateMarketStructure(bars).events.filter((item) => item.type === eventType && (requested === "EITHER" || item.direction === requested)).at(-1);
    const state = event?.id ?? "NONE";
    evaluation = { state, observed: event?.confirmationTimestamp ?? null, triggered: Boolean(event && previousState !== null && previousState !== state) };
  }
  if (condition === "TECH_RSI_CROSS") {
    const values = calculateIndicatorSeries(bars).rsi(14);
    const before = values.at(-2); const now = values.at(-1);
    if (before == null || now == null) return unavailable("RSI_UNAVAILABLE");
    evaluation = crossed(now, parameters.threshold as number, parameters.direction as "UP" | "DOWN" | "EITHER", previousState);
  }
  if (condition === "TECH_MACD_CROSS_SIGNAL") {
    const macd = calculateIndicatorSeries(bars).macd();
    const beforeMacd = macd.macd.at(-2); const beforeSignal = macd.signal.at(-2); const nowMacd = macd.macd.at(-1); const nowSignal = macd.signal.at(-1);
    if ([beforeMacd, beforeSignal, nowMacd, nowSignal].some((value) => value == null)) return unavailable("MACD_UNAVAILABLE");
    evaluation = crossed((nowMacd as number) - (nowSignal as number), 0, parameters.direction as "UP" | "DOWN" | "EITHER", previousState);
  }
  if (["TECH_DIVERGENCE_BULLISH", "TECH_DIVERGENCE_BEARISH"].includes(condition)) {
    const requestedDirection = condition === "TECH_DIVERGENCE_BULLISH" ? "BULLISH" : "BEARISH";
    const requestedIndicator = parameters.indicator as "RSI" | "MACD" | "EITHER";
    const divergence = calculateTechnicalDivergences(bars).divergences.filter((item) => item.direction === requestedDirection && (requestedIndicator === "EITHER" || item.indicator === requestedIndicator)).at(-1);
    const state = divergence?.id ?? "NONE";
    evaluation = { state, observed: divergence?.confirmedAt ?? null, triggered: Boolean(divergence && previousState !== null && previousState !== state) };
  }
  if (condition === "TECH_PRICE_CROSS_EMA") {
    const values = calculateIndicatorSeries(bars).ema(parameters.period as number);
    const before = values.at(-2); const now = values.at(-1);
    if (before == null || now == null) return unavailable("EMA_UNAVAILABLE");
    const nowSpread = current - now;
    evaluation = crossed(nowSpread, 0, parameters.direction as "UP" | "DOWN" | "EITHER", previousState);
  }
  if (condition === "TECH_PRICE_CROSS_AVWAP") {
    const values = anchoredVwap(bars, parameters.anchorTimestamp as string);
    const before = values.at(-2); const now = values.at(-1);
    if (before == null || now == null) return unavailable("ANCHORED_VWAP_UNAVAILABLE");
    evaluation = crossed(current - now, 0, parameters.direction as "UP" | "DOWN" | "EITHER", previousState);
  }
  if (condition === "TECH_PRICE_CROSS_PROFILE") {
    const profile = calculateVolumeProfile(bars, parameters.binCount as number, parameters.valueAreaPercent as number);
    const boundary = parameters.boundary as "POC" | "VAH" | "VAL";
    const level = boundary === "POC" ? profile.poc : boundary === "VAH" ? profile.vah : profile.val;
    if (profile.status !== "AVAILABLE" || level === null) return unavailable("VOLUME_PROFILE_UNAVAILABLE");
    evaluation = crossed(current, level, parameters.direction as "UP" | "DOWN" | "EITHER", previousState);
  }
  if (!evaluation) return unavailable("CONDITION_NOT_IMPLEMENTED");
  const triggered = previousState === null ? false : evaluation.triggered;
  return { available: true, triggered, state: evaluation.state, observed: evaluation.observed, message: `${TECHNICAL_ALERT_REGISTRY[condition].label}: ${String(evaluation.observed ?? evaluation.state)}`, reason: null, freshness: null };
}
