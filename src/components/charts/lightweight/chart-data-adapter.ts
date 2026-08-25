import type { Time } from "lightweight-charts";
import type { TimePoint } from "@/types";
import type { KairoChartPoint } from "./chart-types";

const DAY_MS = 86_400_000;
const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/;
const MONTH_ONLY = /^\d{4}-\d{2}$/;
const YEAR_ONLY = /^\d{4}$/;

function fallbackDate(index: number) {
  return new Date(Date.UTC(2000, 0, 1) + index * DAY_MS).toISOString().slice(0, 10);
}

export function timeKey(value: Time) {
  if (typeof value === "string" || typeof value === "number") return String(value);
  return `${value.year}-${String(value.month).padStart(2, "0")}-${String(value.day).padStart(2, "0")}`;
}

export function normalizeChartTime(value: string | number | Date | null | undefined, fallbackIndex = 0): Time | null {
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : Math.floor(value.getTime() / 1000) as Time;
  if (typeof value === "number") return Number.isFinite(value) ? Math.floor(value) as Time : null;
  if (!value) return fallbackDate(fallbackIndex);
  const trimmed = value.trim();
  if (DATE_ONLY.test(trimmed)) {
    const parsed = new Date(`${trimmed}T00:00:00Z`);
    return Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== trimmed ? null : trimmed;
  }
  if (MONTH_ONLY.test(trimmed)) return normalizeChartTime(`${trimmed}-01`, fallbackIndex);
  if (YEAR_ONLY.test(trimmed)) return normalizeChartTime(`${trimmed}-01-01`, fallbackIndex);
  const parsed = new Date(trimmed);
  if (!Number.isNaN(parsed.getTime())) {
    const hasIntradayTime = /T\d{2}:\d{2}/.test(trimmed);
    return hasIntradayTime ? Math.floor(parsed.getTime() / 1000) as Time : parsed.toISOString().slice(0, 10);
  }
  return fallbackDate(fallbackIndex);
}

export function adaptTimePoints(
  input: Array<{ label?: string; timestamp?: string; time?: string | number | Date; value: number | null | undefined; metadata?: string; color?: string }>,
) {
  const points = new Map<string, KairoChartPoint>();
  let rejected = 0;
  input.forEach((point, index) => {
    if (typeof point.value !== "number" || !Number.isFinite(point.value)) { rejected += 1; return; }
    const sourceTime = point.time ?? point.timestamp ?? point.label;
    const time = normalizeChartTime(sourceTime, index);
    if (time === null) { rejected += 1; return; }
    const label = point.label ?? point.timestamp ?? (sourceTime instanceof Date ? sourceTime.toISOString() : String(sourceTime ?? ""));
    points.set(timeKey(time), { time, value: point.value, label, metadata: point.metadata, color: point.color });
  });
  const data = [...points.values()].sort((left, right) => {
    const leftKey = typeof left.time === "number" ? left.time : new Date(`${timeKey(left.time)}T00:00:00Z`).getTime() / 1000;
    const rightKey = typeof right.time === "number" ? right.time : new Date(`${timeKey(right.time)}T00:00:00Z`).getTime() / 1000;
    return leftKey - rightKey;
  });
  return { data, rejected };
}

export function adaptLegacyTimePoints(data: TimePoint[], key: "value" | "comparison" = "value") {
  return adaptTimePoints(data.map((point) => ({ label: point.label, value: point[key] })));
}

export function adaptVolumePoints(data: TimePoint[], color = "rgba(82, 103, 232, 0.28)") {
  return adaptTimePoints(data.map((point) => ({ label: point.label, value: point.volume, color })));
}

export function patternHorizonTime(horizon: number, minimumHorizon: number) {
  return fallbackDate(horizon - minimumHorizon);
}
