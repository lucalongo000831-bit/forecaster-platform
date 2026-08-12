import { GLOBAL_RISK_CONFIG, GLOBAL_RISK_THRESHOLDS, GLOBAL_RISK_WEIGHTS, GLOBAL_STRESS_MODEL_VERSION } from "./config";
import { clamp, confidenceFromCompleteness, round } from "./scoring";
import { SystemicStressEngine } from "./systemic-stress-engine";
import type { GlobalRiskComponent, GlobalRiskSnapshot, GlobalRiskStatus, GlobalStressEngineInput, RiskConfidence, RiskTrend } from "./types";

export function statusForScore(score: number): GlobalRiskStatus {
  return GLOBAL_RISK_THRESHOLDS.find((threshold) => score >= threshold.min && score <= threshold.max)?.status ?? (score < 0 ? "GREEN" : "RED");
}

export function calculateWeightedScore(components: GlobalRiskComponent[]) {
  const available = components.filter((component) => component.score !== null);
  const availableWeight = available.reduce((sum, component) => sum + GLOBAL_RISK_WEIGHTS[component.key], 0);
  if (!availableWeight) return { score: 0, completeness: 0 };
  const score = available.reduce((sum, component) => sum + component.score! * GLOBAL_RISK_WEIGHTS[component.key], 0) / availableWeight;
  const completeness = components.reduce((sum, component) => sum + component.completeness * GLOBAL_RISK_WEIGHTS[component.key], 0);
  return { score: round(clamp(score), 0), completeness: round(clamp(completeness), 0) };
}

export function deriveTrend(current: number, history: GlobalStressEngineInput["history"]): RiskTrend {
  const comparisons = [
    history.oneDay === null ? null : current - history.oneDay,
    history.fiveDay === null ? null : current - history.fiveDay,
    history.twentyDay === null ? null : current - history.twentyDay,
  ].filter((value): value is number => value !== null);
  if (!comparisons.length) return "STABLE";
  const composite = comparisons.reduce((sum, value, index) => sum + value * [0.5, 0.3, 0.2][index]!, 0) / comparisons.slice(0, 3).reduce((sum, _, index) => sum + [0.5, 0.3, 0.2][index]!, 0);
  if (composite <= -5) return "IMPROVING";
  if (composite >= 12) return "RAPIDLY_DETERIORATING";
  if (composite >= 4) return "DETERIORATING";
  return "STABLE";
}

function summaryFor(status: GlobalRiskStatus, systemic: GlobalRiskSnapshot["systemicStress"], trend: RiskTrend, drivers: GlobalRiskSnapshot["riskDrivers"]): GlobalRiskSnapshot["summary"] {
  const label = status === "GREEN" ? "normal" : status === "YELLOW" ? "elevated but contained" : status === "ORANGE" ? "high" : "severe";
  const systemicText = systemic === "NONE" ? "No broad evidence of systemic market dysfunction is currently detected." : systemic === "WATCH" ? "Cross-market transmission is on watch, but confirmation remains limited." : systemic === "ELEVATED" ? "Multiple independent stress blocks are elevated, including a transmission channel." : "Available indicators show broad, simultaneous stress across independent market blocks.";
  const driverText = drivers.length ? `The leading quantitative driver is ${drivers[0]!.component.toLowerCase()}.` : "No single quantitative driver dominates the available data.";
  return {
    headline: `Global markets remain in a ${status} risk regime.`,
    shortSummary: `According to available indicators, global market stress is ${label} and the trend is ${trend.toLowerCase().replaceAll("_", " ")}.`,
    riskSummary: `${driverText} This assessment is conditional on current provider coverage.`,
    stabilitySummary: systemicText,
  };
}

function adjustedConfidence(base: RiskConfidence, sources: GlobalStressEngineInput["sources"]): RiskConfidence {
  const ranks: RiskConfidence[] = ["VERY_LOW", "LOW", "MEDIUM", "HIGH", "VERY_HIGH"];
  const unavailable = sources?.filter((source) => !source.available).length ?? 0;
  const stale = sources?.filter((source) => source.freshness === "STALE" || source.freshness === "UNAVAILABLE").length ?? 0;
  const penalty = unavailable >= 2 ? 2 : unavailable || stale ? 1 : 0;
  return ranks[Math.max(0, ranks.indexOf(base) - penalty)]!;
}

export class GlobalStressEngine {
  private systemic = new SystemicStressEngine();

  calculate(input: GlobalStressEngineInput): GlobalRiskSnapshot {
    const weighted = calculateWeightedScore(input.components);
    const score = weighted.score;
    const status = statusForScore(score);
    const systemicStress = this.systemic.evaluate(input.components);
    const trend = deriveTrend(score, input.history);
    const components = input.components.map((component) => ({ ...component, contribution: component.score === null ? 0 : round(component.score * component.weight) }));
    const riskDrivers = components.filter((component) => component.score !== null).map((component) => ({ component: component.label, score: component.score!, change: component.change, contribution: component.contribution })).sort((a, b) => b.contribution - a.contribution).slice(0, 5);
    const stabilizingFactors = components.filter((component) => component.score !== null && component.score < 40).sort((a, b) => a.score! - b.score!).slice(0, 4).map((component) => `${component.label} remains contained according to available ${component.metrics.some((metric) => metric.dataType === "PROXY") ? "proxies" : "indicators"}.`);
    const component = (key: GlobalRiskComponent["key"]) => components.find((item) => item.key === key);
    const vix = component("VOLATILITY")?.metrics.find((item) => item.key === "vix")?.value ?? null;
    const drawdown = component("EQUITY_STRESS")?.metrics.find((item) => item.key === "sp500_drawdown")?.value ?? null;
    const correlations = component("CROSS_ASSET")?.metrics.find((item) => item.key === "stress_correlation")?.value ?? null;
    const escalationTriggers = [
      { id: "vix", direction: "ESCALATION" as const, label: "Volatility regime break", threshold: `VIX above ${GLOBAL_RISK_CONFIG.triggers.vixOrange}`, active: vix !== null && vix >= GLOBAL_RISK_CONFIG.triggers.vixOrange },
      { id: "credit", direction: "ESCALATION" as const, label: "Credit deterioration", threshold: `Credit stress above ${GLOBAL_RISK_CONFIG.triggers.creditOrange}`, active: (component("CREDIT")?.score ?? 0) >= GLOBAL_RISK_CONFIG.triggers.creditOrange },
      { id: "liquidity", direction: "ESCALATION" as const, label: "Liquidity deterioration", threshold: `Liquidity stress above ${GLOBAL_RISK_CONFIG.triggers.liquidityOrange}`, active: (component("LIQUIDITY")?.score ?? 0) >= GLOBAL_RISK_CONFIG.triggers.liquidityOrange },
      { id: "drawdown", direction: "ESCALATION" as const, label: "Deep equity drawdown", threshold: `S&P 500 drawdown below ${GLOBAL_RISK_CONFIG.triggers.equityDrawdownOrange}%`, active: drawdown !== null && drawdown <= GLOBAL_RISK_CONFIG.triggers.equityDrawdownOrange },
      { id: "correlation", direction: "ESCALATION" as const, label: "Cross-asset correlation spike", threshold: `Stress correlation above ${GLOBAL_RISK_CONFIG.triggers.crossAssetCorrelationOrange}`, active: correlations !== null && correlations >= GLOBAL_RISK_CONFIG.triggers.crossAssetCorrelationOrange },
      { id: "breadth", direction: "ESCALATION" as const, label: "Breadth deterioration", threshold: `Breadth stress above ${GLOBAL_RISK_CONFIG.triggers.breadthOrange}`, active: (component("MARKET_BREADTH")?.score ?? 0) >= GLOBAL_RISK_CONFIG.triggers.breadthOrange },
    ];
    const deEscalationTriggers = ["VOLATILITY", "CREDIT", "LIQUIDITY", "MARKET_BREADTH", "RATES"].map((key) => { const item = component(key as GlobalRiskComponent["key"]); return { id: `normalize-${key.toLowerCase()}`, direction: "DE_ESCALATION" as const, label: `${item?.label ?? key} normalization`, threshold: `Component below ${GLOBAL_RISK_CONFIG.triggers.normalizeComponent}`, active: item?.score !== null && item?.score !== undefined && item.score < GLOBAL_RISK_CONFIG.triggers.normalizeComponent }; });
    const confidence = adjustedConfidence(confidenceFromCompleteness(weighted.completeness), input.sources);
    const metrics = components.flatMap((component) => component.metrics.filter((item) => item.stressScore !== null));
    const directDataCoverage = metrics.length ? round(metrics.filter((item) => item.dataType === "DIRECT" || item.dataType === "CALCULATED_FROM_DIRECT").length / metrics.length * 100, 0) : 0;
    const proxyShare = metrics.length ? round(metrics.filter((item) => item.dataType === "PROXY").length / metrics.length * 100, 0) : 0;
    const activeLayers = components.filter((component) => component.score !== null).length; const staleLayers = components.filter((component) => component.isLastKnownGood).length;
    const dataStatus = activeLayers === 0 ? "SOURCE_UNAVAILABLE" as const : staleLayers === activeLayers ? "STALE" as const : weighted.completeness < 70 ? "PARTIAL" as const : "AVAILABLE" as const;
    return {
      id: null, status, score, previousStatus: input.history.previousStatus, previousScore: input.history.previousScore, change: input.history.previousScore === null ? null : round(score - input.history.previousScore), trend, systemicStress, confidence, dataCompleteness: weighted.completeness, directDataCoverage, proxyShare, activeLayers, staleLayers, dataStatus, components, riskDrivers, stabilizingFactors, escalationTriggers, deEscalationTriggers,
      summary: summaryFor(status, systemicStress, trend, riskDrivers), equityMarkets: input.equityMarkets ?? [], crossAssets: input.crossAssets ?? [], calculatedAt: input.calculatedAt ?? new Date().toISOString(), inputTimestamp: input.inputTimestamp ?? new Date().toISOString(), lastStatusChangeAt: input.history.lastStatusChangeAt, modelVersion: GLOBAL_STRESS_MODEL_VERSION, sources: input.sources ?? [],
    };
  }
}
