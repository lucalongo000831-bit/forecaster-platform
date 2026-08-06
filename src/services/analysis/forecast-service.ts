import "server-only";

import { analyzeForecast, type ForecastHorizon } from "@/engines/forecast";
import { analyzeMarketRegime } from "@/engines/regime";
import { analyzeRiskPlan } from "@/engines/risk";
import type { SignalHorizon } from "@/engines/signals";
import type { TargetHorizon } from "@/engines/targets";
import { normalizeSymbol } from "@/services/yahoo/symbol-resolver";
import { getSeasonalityAnalysis } from "./seasonality-service";
import { getTargetAnalysis } from "./target-service";
import { getTechnicalAnalysis } from "./technical-service";

const signalHorizon: Record<ForecastHorizon, SignalHorizon> = { "1d": "1d", "5d": "1w", "10d": "1w", "20d": "1m", "1m": "1m", "3m": "3m", "6m": "6m", "12m": "12m" };
const targetHorizon: Record<ForecastHorizon, TargetHorizon> = { "1d": "3m", "5d": "3m", "10d": "3m", "20d": "3m", "1m": "3m", "3m": "3m", "6m": "6m", "12m": "12m" };

export async function getForecastAnalysis(symbolInput: string, horizon: ForecastHorizon = "1m", targetOverride?: number | null, stopOverride?: number | null) {
  const symbol = normalizeSymbol(decodeURIComponent(symbolInput));
  const [technical, seasonality, targets] = await Promise.all([
    getTechnicalAnalysis(symbol, signalHorizon[horizon], "^GSPC"),
    getSeasonalityAnalysis(symbol, "20Y").catch(() => null),
    getTargetAnalysis(symbol, targetHorizon[horizon]).catch(() => null),
  ]);
  const regime = analyzeMarketRegime(technical.benchmarkAnalysis ?? technical.analysis);
  const risk = analyzeRiskPlan({ symbol, side: "LONG", entryPrice: technical.analysis.price, horizon: signalHorizon[horizon], riskProfile: "MODERATE", technical: technical.analysis });
  const analysis = analyzeForecast({
    symbol, horizon, currency: targets?.analysis.currency ?? "USD", bars: technical.analysis.input,
    technical: technical.analysis, seasonality, regime,
    targetPrice: targetOverride ?? targets?.analysis.compositeTarget ?? null,
    stopPrice: stopOverride ?? risk.suggestedStop,
  });
  return { analysis, providers: [...new Set([technical.provider, technical.benchmarkProvider, seasonality?.provider, ...(targets?.providers ?? [])].flatMap((value) => value ? [value] : []))] };
}
