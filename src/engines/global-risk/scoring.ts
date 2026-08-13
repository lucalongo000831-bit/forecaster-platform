import { GLOBAL_RISK_WEIGHTS } from "./config";
import type { GlobalRiskComponent, GlobalRiskComponentKey, RiskConfidence, RiskMetric } from "./types";

export function clamp(value: number, min = 0, max = 100) { return Math.min(max, Math.max(min, value)); }
export function round(value: number, digits = 1) { const factor = 10 ** digits; return Math.round(value * factor) / factor; }
export function scale(value: number | null, low: number, high: number, invert = false): number | null {
  if (value === null || !Number.isFinite(value) || high === low) return null;
  const score = clamp((value - low) / (high - low) * 100);
  return round(invert ? 100 - score : score);
}
export function average(values: Array<number | null | undefined>): number | null {
  const valid = values.filter((value): value is number => typeof value === "number" && Number.isFinite(value));
  return valid.length ? round(valid.reduce((sum, value) => sum + value, 0) / valid.length) : null;
}
export function confidenceFromCompleteness(completeness: number): RiskConfidence {
  if (completeness >= 95) return "VERY_HIGH";
  if (completeness >= 80) return "HIGH";
  if (completeness >= 60) return "MEDIUM";
  if (completeness >= 35) return "LOW";
  return "VERY_LOW";
}
export function componentClassification(score: number | null) {
  if (score === null) return "UNAVAILABLE";
  if (score < 20) return "LOW";
  if (score < 40) return "NORMAL";
  if (score < 60) return "ELEVATED";
  if (score < 80) return "HIGH";
  return "EXTREME";
}
export function metric(key: string, label: string, value: number | null, stressScore: number | null, options: Partial<Omit<RiskMetric, "key" | "label" | "value" | "stressScore" | "displayValue">> & { displayValue?: string } = {}): RiskMetric {
  return { key, label, value, stressScore, displayValue: options.displayValue ?? (value === null ? "Unavailable" : round(value, 2).toString()), dataType: options.dataType ?? (value === null ? "MISSING" : "CALCULATED_FROM_DIRECT"), source: options.source ?? "KAIRO calculated from direct inputs", asOf: options.asOf ?? null, detail: options.detail };
}
export function buildComponent(key: GlobalRiskComponentKey, label: string, metrics: RiskMetric[], summary: string): GlobalRiskComponent {
  const valid = metrics.filter((item) => item.stressScore !== null);
  const score = average(valid.map((item) => item.stressScore));
  const completeness = round(metrics.length ? valid.length / metrics.length * 100 : 0, 0);
  const weight = GLOBAL_RISK_WEIGHTS[key];
  return { key, label, score, change: null, weight, contribution: score === null ? 0 : round(score * weight), completeness, classification: componentClassification(score), confidence: confidenceFromCompleteness(completeness), summary, metrics, sources: [...new Set(metrics.filter((item) => item.value !== null).map((item) => item.source))] };
}
