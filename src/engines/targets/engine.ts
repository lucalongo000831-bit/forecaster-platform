import { analyzeDcf } from "@/engines/dcf";
import { clamp, mean } from "@/engines/shared/statistics";
import { TARGET_MODEL_VERSION, type ScenarioTargetDetail, type TargetAnalysis, type TargetEngineInput, type TargetHorizon } from "./types";

const weights: Record<TargetHorizon, { analyst: number; technical: number; fundamental: number; macro: number }> = {
  "3m": { analyst: 0.2, technical: 0.65, fundamental: 0.1, macro: 0.05 },
  "6m": { analyst: 0.35, technical: 0.35, fundamental: 0.2, macro: 0.1 },
  "12m": { analyst: 0.45, technical: 0.2, fundamental: 0.25, macro: 0.1 },
  long: { analyst: 0.3, technical: 0.1, fundamental: 0.5, macro: 0.1 },
};

function average(values: Array<number | null>) { return mean(values.filter((value): value is number => value !== null)); }
function pct(value: number | null, current: number) { return value === null || current === 0 ? null : (value / current - 1) * 100; }

export function analyzeTargets(input: TargetEngineInput): TargetAnalysis {
  const atr = input.technical.volatility.atr14.value;
  const support = average([input.technical.structure.support20, input.technical.structure.swingLow]);
  const resistance = average([input.technical.structure.resistance20, input.technical.structure.swingHigh]);
  const technicalBase = resistance ?? input.currentPrice;
  const technicalTarget: ScenarioTargetDetail = {
    value: technicalBase,
    bear: support === null ? atr === null ? null : input.currentPrice - atr * 2 : support - (atr ?? 0) * 0.5,
    base: technicalBase,
    bull: resistance === null ? atr === null ? null : input.currentPrice + atr * 3 : resistance + (atr ?? 0) * 2,
    methods: ["Support/resistance 20 periodi", "Swing points", "ATR e bande di volatilità"],
    confidence: clamp(input.technical.completeness * 0.8 + (atr === null ? 0 : 20), 0, 100),
  };
  const summary = input.fundamental?.inputs.summary;
  const dcf = analyzeDcf({
    freeCashFlow: input.fundamental?.metrics.freeCashFlow ?? summary?.freeCashflow ?? null,
    historicalGrowth: input.fundamental?.metrics.freeCashFlowGrowthYoY ?? null,
    netDebt: input.fundamental?.metrics.netDebt ?? null,
    sharesOutstanding: summary?.sharesOutstanding ?? null,
    stockBasedCompensation: input.fundamental?.metrics.stockBasedCompensation ?? null,
    instrumentType: input.instrumentType,
  });
  const normalizedPe = summary?.trailingEps && summary.trailingEps > 0
    ? summary.trailingEps * clamp(average([summary.trailingPe, summary.forwardPe]) ?? 15, 8, 35)
    : null;
  const dcfBear = dcf.scenarios.find((scenario) => scenario.name === "BEAR")?.fairValuePerShare ?? null;
  const dcfBase = dcf.scenarios.find((scenario) => scenario.name === "BASE")?.fairValuePerShare ?? null;
  const dcfBull = dcf.scenarios.find((scenario) => scenario.name === "BULL")?.fairValuePerShare ?? null;
  const fundamentalBase = average([normalizedPe, dcfBase]);
  const fundamentalTarget: ScenarioTargetDetail = {
    value: fundamentalBase,
    bear: average([normalizedPe === null ? null : normalizedPe * 0.8, dcfBear]),
    base: fundamentalBase,
    bull: average([normalizedPe === null ? null : normalizedPe * 1.2, dcfBull]),
    methods: [...(normalizedPe === null ? [] : ["P/E normalizzato"]), ...(dcf.applicable ? ["DCF prudente a tre scenari"] : [])],
    confidence: input.fundamental ? ({ INSUFFICIENT: 0, LOW: 35, MEDIUM: 65, HIGH: 90 } as const)[input.fundamental.confidence] : 0,
  };
  const analystValue = input.analyst?.targetConsensus ?? input.analyst?.targetMedian ?? null;
  const dispersion = analystValue && input.analyst?.targetLow !== null && input.analyst?.targetLow !== undefined && input.analyst.targetHigh !== null
    ? (input.analyst.targetHigh - input.analyst.targetLow) / analystValue * 100 : null;
  const analystTarget = {
    value: analystValue, minimum: input.analyst?.targetLow ?? null, mean: input.analyst?.targetConsensus ?? null,
    median: input.analyst?.targetMedian ?? null, maximum: input.analyst?.targetHigh ?? null,
    analystCount: input.analyst?.analystCount ?? null, dispersion, updatedAt: input.analyst?.asOf ?? null,
    upsideDownside: pct(analystValue, input.currentPrice), provider: input.analystProvider,
  };
  const macroAdjustment = input.regime.direction === "BULL" ? 1.05 : input.regime.direction === "BEAR" ? 0.95 : 1;
  const macro = input.currentPrice * macroAdjustment;
  const configured = weights[input.horizon];
  const sourceValues = {
    analyst: { bear: input.analyst?.targetLow ?? null, base: analystValue, bull: input.analyst?.targetHigh ?? null, confidence: analystValue === null ? 0 : input.analyst?.analystCount ? clamp(input.analyst.analystCount * 5, 30, 95) : 35 },
    technical: { bear: technicalTarget.bear, base: technicalTarget.base, bull: technicalTarget.bull, confidence: technicalTarget.confidence },
    fundamental: { bear: fundamentalTarget.bear, base: fundamentalTarget.base, bull: fundamentalTarget.bull, confidence: fundamentalTarget.confidence },
    macro: { bear: macro * 0.95, base: macro, bull: macro * 1.05, confidence: input.regime.confidence },
  };
  function composite(scenario: "bear" | "base" | "bull") {
    const available = (Object.keys(configured) as Array<keyof typeof configured>).filter((key) => sourceValues[key][scenario] !== null && sourceValues[key].confidence > 0);
    const totalWeight = available.reduce((sum, key) => sum + configured[key], 0);
    return totalWeight === 0 ? null : available.reduce((sum, key) => sum + (sourceValues[key][scenario] as number) * configured[key] / totalWeight, 0);
  }
  const bearTarget = composite("bear"); const baseTarget = composite("base"); const bullTarget = composite("bull");
  const activeKeys = (Object.keys(configured) as Array<keyof typeof configured>).filter((key) => sourceValues[key].base !== null && sourceValues[key].confidence > 0);
  const activeWeight = activeKeys.reduce((sum, key) => sum + configured[key], 0);
  const confidence = activeWeight === 0 ? 0 : activeKeys.reduce((sum, key) => sum + sourceValues[key].confidence * configured[key] / activeWeight, 0) * activeWeight;
  return {
    symbol: input.symbol, horizon: input.horizon, currentPrice: input.currentPrice, currency: input.currency, bearTarget, baseTarget, bullTarget,
    compositeTarget: baseTarget, analystTarget, technicalTarget, fundamentalTarget, dcf,
    upsideDownside: pct(baseTarget, input.currentPrice), confidence: clamp(confidence, 0, 100),
    assumptions: [...dcf.assumptions, `Regime ${input.regime.regime} applicato solo al ${Math.round(configured.macro * 100)}% del composito.`],
    methodology: ["Fonti disponibili rinormalizzate senza sostituzioni mock.", "Target analisti, tecnico, fondamentale e macro restano separati.", "Il composito usa pesi specifici per orizzonte e qualità."],
    modelVersion: TARGET_MODEL_VERSION, calculatedAt: new Date().toISOString(), dataTimestamp: input.technical.timestamp,
  };
}
