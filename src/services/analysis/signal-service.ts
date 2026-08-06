import "server-only";

import { analyzeMarketRegime } from "@/engines/regime";
import { analyzeSignal, type SignalHorizon } from "@/engines/signals";
import { normalizeSymbol } from "@/services/yahoo/symbol-resolver";
import { getFundamentalAnalysis } from "./fundamental-service";
import { getSeasonalityAnalysis } from "./seasonality-service";
import { getTechnicalAnalysis } from "./technical-service";

export async function getSignalAnalysis(symbolInput: string, horizon: SignalHorizon = "1m") {
  const symbol = normalizeSymbol(decodeURIComponent(symbolInput));
  const includeSlowFactors = !["intraday", "1d"].includes(horizon);
  const [technicalResult, fundamentalResult, seasonality] = await Promise.all([
    getTechnicalAnalysis(symbol, horizon, "^GSPC"),
    includeSlowFactors ? getFundamentalAnalysis(symbol).catch(() => null) : Promise.resolve(null),
    includeSlowFactors ? getSeasonalityAnalysis(symbol, "20Y").catch(() => null) : Promise.resolve(null),
  ]);
  const benchmarkTechnical = technicalResult.benchmarkAnalysis ?? technicalResult.analysis;
  const regime = analyzeMarketRegime(benchmarkTechnical);
  const analysis = analyzeSignal({ symbol, horizon, technical: technicalResult.analysis, fundamental: fundamentalResult?.analysis, seasonality, regime });
  return {
    analysis,
    providers: [...new Set([technicalResult.provider, technicalResult.benchmarkProvider, fundamentalResult?.provider, seasonality?.provider].filter((value): value is string => Boolean(value)))],
  };
}
