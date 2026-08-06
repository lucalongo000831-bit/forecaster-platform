import { clamp } from "@/engines/shared/statistics";
import { SIGNAL_CATEGORY_THRESHOLDS, SIGNAL_MINIMUM_COMPLETENESS, SIGNAL_WEIGHTS } from "./config";
import { SIGNAL_MODEL_VERSION, type SignalAnalysis, type SignalCategory, type SignalComponent, type SignalComponentKey, type SignalEngineInput } from "./types";

const labels: Record<SignalComponentKey, string> = {
  trend: "Trend", momentum: "Momentum", volatility: "Volatility", volume: "Volume", structure: "Price structure", relative: "Relative strength", fundamental: "Fundamentals", seasonality: "Seasonality", regime: "Market regime",
};

function seasonalityScore(input: SignalEngineInput["seasonality"]): number | null {
  if (!input || input.quality === "INSUFFICIENT") return null;
  const currentMonth = new Date(input.dataTimestamp).getUTCMonth() + 1;
  const bucket = input.monthly.find((item) => item.key === currentMonth);
  if (!bucket || bucket.mean === null || bucket.hitRate === null) return null;
  return clamp(50 + bucket.mean * 4 + (bucket.hitRate - 50) * 0.45 + (bucket.stability ?? 0) * 5, 0, 100);
}

function categoryFor(score: number): SignalCategory {
  for (const [category, [minimum, maximum]] of Object.entries(SIGNAL_CATEGORY_THRESHOLDS)) {
    if (score >= minimum && score < maximum) return category as SignalCategory;
  }
  return "HOLD";
}

function reasonFor(key: SignalComponentKey, score: number | null) {
  if (score === null) return `${labels[key]} non disponibile: peso escluso dal calcolo.`;
  return `${labels[key]} ${score >= 60 ? "costruttivo" : score < 40 ? "debole" : "neutrale"} (${score.toFixed(1)}/100).`;
}

export function analyzeSignal(input: SignalEngineInput): SignalAnalysis {
  const weights = SIGNAL_WEIGHTS[input.horizon];
  const rawScores: Record<SignalComponentKey, number | null> = {
    trend: input.technical.trend.score,
    momentum: input.technical.momentum.score,
    volatility: input.technical.volatility.score,
    volume: input.technical.volume.score,
    structure: input.technical.structure.score,
    relative: input.technical.relativeStrength.score,
    fundamental: input.fundamental?.confidence === "INSUFFICIENT" ? null : input.fundamental?.fundamentalScore ?? null,
    seasonality: seasonalityScore(input.seasonality),
    regime: input.regime.score,
  };
  const availableWeight = Object.entries(weights).reduce((sum, [key, weight]) => sum + (rawScores[key as SignalComponentKey] === null ? 0 : weight), 0);
  const completeness = clamp(availableWeight * 100, 0, 100);
  const components: SignalComponent[] = (Object.keys(weights) as SignalComponentKey[]).map((key) => {
    const score = rawScores[key];
    const effectiveWeight = score === null || availableWeight === 0 ? 0 : weights[key] / availableWeight;
    return { key, label: labels[key], score, configuredWeight: weights[key], effectiveWeight, contribution: score === null ? null : score * effectiveWeight, available: score !== null, reason: reasonFor(key, score) };
  });
  const rawComposite = components.reduce((sum, component) => sum + (component.contribution ?? 0), 0);
  const canGenerate = completeness >= SIGNAL_MINIMUM_COMPLETENESS && input.technical.completeness >= 50 && input.technical.observations >= 30;
  const score = canGenerate ? clamp(rawComposite, 0, 100) : null;
  const category = score === null ? null : categoryFor(score);
  const inputQuality = [
    input.technical.completeness,
    input.regime.confidence,
    input.fundamental ? ({ INSUFFICIENT: 15, LOW: 40, MEDIUM: 70, HIGH: 95 } as const)[input.fundamental.confidence] : 0,
    input.seasonality ? ({ INSUFFICIENT: 15, LOW: 40, MEDIUM: 70, HIGH: 95 } as const)[input.seasonality.quality] : 0,
  ];
  const qualityAverage = inputQuality.reduce((sum, value) => sum + value, 0) / inputQuality.length;
  const confidence = canGenerate ? clamp(completeness * 0.55 + qualityAverage * 0.45, 0, 100) : 0;
  const dataQuality = !canGenerate ? "INSUFFICIENT" : confidence >= 80 ? "HIGH" : confidence >= 60 ? "MEDIUM" : "LOW";
  const ranked = components.filter((component) => component.score !== null && component.configuredWeight > 0).sort((a, b) => Math.abs((b.score ?? 50) - 50) * b.configuredWeight - Math.abs((a.score ?? 50) - 50) * a.configuredWeight);
  const reasons = canGenerate ? ranked.slice(0, 4).map((component) => component.reason) : [
    `Completezza ${completeness.toFixed(1)}%: minimo richiesto ${SIGNAL_MINIMUM_COMPLETENESS}%.`,
    `Completezza tecnica ${input.technical.completeness.toFixed(1)}% su ${input.technical.observations} osservazioni.`,
  ];
  const invalidations = [
    ...(input.technical.structure.support20 === null ? [] : [`Violazione del supporto tecnico a ${input.technical.structure.support20.toFixed(2)}.`]),
    ...(input.technical.structure.resistance20 === null ? [] : [`Superamento della resistenza tecnica a ${input.technical.structure.resistance20.toFixed(2)}.`]),
    ...input.regime.invalidations.slice(0, 1),
  ];
  const { input: _regimeInput, ...regime } = input.regime;
  void _regimeInput;

  return {
    symbol: input.symbol,
    horizon: input.horizon,
    category,
    score,
    confidence,
    completeness,
    calculatedAt: new Date().toISOString(),
    dataTimestamp: input.technical.timestamp,
    modelVersion: SIGNAL_MODEL_VERSION,
    dataQuality,
    components,
    regime,
    reasons,
    invalidations,
    historicalHitRate: null,
    sampleSize: input.technical.observations,
    disclaimer: "Segnale quantitativo sperimentale, non una raccomandazione d'investimento. I pesi disponibili vengono rinormalizzati; il tasso storico resta non disponibile finché non è validato dal motore di backtest.",
    inputs: { technical: input.technical, fundamental: input.fundamental ?? null, seasonality: input.seasonality ?? null },
  };
}
