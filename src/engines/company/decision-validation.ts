import type { MarketChartPoint } from "@/types";
import type { CompanyVerdict } from "@/types/company-intelligence";

export const COMPANY_DECISION_VALIDATION_VERSION = "company-decision-validation-v1.0.0";

export type DecisionValidationHorizon = "1W" | "1M" | "3M" | "6M" | "1Y";
export type ValidatableCompanyVerdict = "STRONG_BUY" | "BUY" | "AVOID" | "SHORT";

export interface CompanyDecisionSnapshot {
  id: string;
  asOf: string;
  verdict: CompanyVerdict;
  referencePrice: number;
  modelVersion: string;
}

export interface CompanyDecisionOutcome {
  snapshotId: string;
  verdict: ValidatableCompanyVerdict;
  horizon: DecisionValidationHorizon;
  asOf: string;
  entryPrice: number;
  exitAt: string;
  exitPrice: number;
  returnPercent: number;
  maximumAdverseExcursion: number;
  hit: boolean;
}

export interface CompanyDecisionValidationBucket {
  verdict: ValidatableCompanyVerdict;
  horizon: DecisionValidationHorizon;
  observations: number;
  statisticallyReliable: boolean;
  hitRate: number | null;
  averageReturn: number | null;
  medianReturn: number | null;
  maximumDrawdown: number | null;
  periodFrom: string | null;
  periodTo: string | null;
  stability: "HIGH" | "MEDIUM" | "LOW" | "INSUFFICIENT";
}

export interface CompanyDecisionValidationResult {
  symbol: string;
  buckets: CompanyDecisionValidationBucket[];
  outcomes: CompanyDecisionOutcome[];
  snapshotsEvaluated: number;
  minimumReliableSample: number;
  modelVersion: typeof COMPANY_DECISION_VALIDATION_VERSION;
  generatedAt: string;
  biasControls: string[];
  limitations: string[];
}

const HORIZON_SESSIONS: Record<DecisionValidationHorizon, number> = { "1W": 5, "1M": 21, "3M": 63, "6M": 126, "1Y": 252 };
const VALIDATABLE_VERDICTS = new Set<ValidatableCompanyVerdict>(["STRONG_BUY", "BUY", "AVOID", "SHORT"]);
const MINIMUM_RELIABLE_SAMPLE = 10;

function mean(values: number[]) {
  return values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : null;
}

function median(values: number[]) {
  if (!values.length) return null;
  const sorted = [...values].sort((left, right) => left - right);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
}

function standardDeviation(values: number[]) {
  const average = mean(values);
  if (average === null || values.length < 2) return null;
  return Math.sqrt(values.reduce((sum, value) => sum + (value - average) ** 2, 0) / (values.length - 1));
}

function stability(values: number[], reliable: boolean): CompanyDecisionValidationBucket["stability"] {
  if (!reliable) return "INSUFFICIENT";
  const average = mean(values);
  const deviation = standardDeviation(values);
  if (average === null || deviation === null) return "LOW";
  const dispersion = deviation / Math.max(1, Math.abs(average));
  return dispersion <= 1 ? "HIGH" : dispersion <= 2 ? "MEDIUM" : "LOW";
}

function isHit(verdict: ValidatableCompanyVerdict, rawLongReturn: number) {
  if (verdict === "STRONG_BUY" || verdict === "BUY") return rawLongReturn > 0;
  return rawLongReturn < 0;
}

function cleanBars(bars: MarketChartPoint[]) {
  return bars
    .filter((bar) => Number.isFinite(bar.close) && bar.close > 0 && Number.isFinite(bar.low) && bar.low > 0 && Number.isFinite(bar.high) && bar.high > 0 && !Number.isNaN(Date.parse(bar.timestamp)))
    .sort((left, right) => Date.parse(left.timestamp) - Date.parse(right.timestamp));
}

export function validateCompanyDecisions(input: { symbol: string; snapshots: CompanyDecisionSnapshot[]; bars: MarketChartPoint[]; now?: string }): CompanyDecisionValidationResult {
  const bars = cleanBars(input.bars);
  const outcomes: CompanyDecisionOutcome[] = [];
  const snapshots = input.snapshots
    .filter((snapshot): snapshot is CompanyDecisionSnapshot & { verdict: ValidatableCompanyVerdict } => VALIDATABLE_VERDICTS.has(snapshot.verdict as ValidatableCompanyVerdict) && Number.isFinite(snapshot.referencePrice) && snapshot.referencePrice > 0 && !Number.isNaN(Date.parse(snapshot.asOf)))
    .sort((left, right) => Date.parse(left.asOf) - Date.parse(right.asOf));

  for (const snapshot of snapshots) {
    const firstFutureIndex = bars.findIndex((bar) => Date.parse(bar.timestamp) > Date.parse(snapshot.asOf));
    if (firstFutureIndex < 0) continue;
    for (const [horizon, sessions] of Object.entries(HORIZON_SESSIONS) as Array<[DecisionValidationHorizon, number]>) {
      const exit = bars[firstFutureIndex + sessions - 1];
      if (!exit) continue;
      const path = bars.slice(firstFutureIndex, firstFutureIndex + sessions);
      const rawLongReturn = (exit.close / snapshot.referencePrice - 1) * 100;
      const returnPercent = snapshot.verdict === "SHORT" ? -rawLongReturn : rawLongReturn;
      const adverse = snapshot.verdict === "SHORT"
        ? Math.min(...path.map((bar) => -(bar.high / snapshot.referencePrice - 1) * 100))
        : Math.min(...path.map((bar) => (bar.low / snapshot.referencePrice - 1) * 100));
      outcomes.push({ snapshotId: snapshot.id, verdict: snapshot.verdict, horizon, asOf: snapshot.asOf, entryPrice: snapshot.referencePrice, exitAt: exit.timestamp, exitPrice: exit.close, returnPercent, maximumAdverseExcursion: adverse, hit: isHit(snapshot.verdict, rawLongReturn) });
    }
  }

  const buckets: CompanyDecisionValidationBucket[] = [];
  for (const verdict of VALIDATABLE_VERDICTS) {
    for (const horizon of Object.keys(HORIZON_SESSIONS) as DecisionValidationHorizon[]) {
      const sample = outcomes.filter((outcome) => outcome.verdict === verdict && outcome.horizon === horizon);
      const returns = sample.map((outcome) => outcome.returnPercent);
      const reliable = sample.length >= MINIMUM_RELIABLE_SAMPLE;
      buckets.push({ verdict, horizon, observations: sample.length, statisticallyReliable: reliable, hitRate: reliable ? sample.filter((outcome) => outcome.hit).length / sample.length * 100 : null, averageReturn: reliable ? mean(returns) : null, medianReturn: reliable ? median(returns) : null, maximumDrawdown: reliable ? Math.min(...sample.map((outcome) => outcome.maximumAdverseExcursion)) : null, periodFrom: sample.at(0)?.asOf ?? null, periodTo: sample.at(-1)?.exitAt ?? null, stability: stability(returns, reliable) });
    }
  }

  return {
    symbol: input.symbol,
    buckets,
    outcomes,
    snapshotsEvaluated: snapshots.length,
    minimumReliableSample: MINIMUM_RELIABLE_SAMPLE,
    modelVersion: COMPANY_DECISION_VALIDATION_VERSION,
    generatedAt: input.now ?? new Date().toISOString(),
    biasControls: ["Only immutable snapshots saved before the evaluated price bars are accepted.", "Every evaluation starts from the first market bar strictly after the snapshot timestamp.", "Metrics remain hidden until at least ten independent observations are available."],
    limitations: ["Overlapping holding periods can reduce observation independence.", "Results exclude fees, taxes, spread and slippage because they validate decisions rather than executable strategies.", "Historical results do not imply future performance."],
  };
}
