import "server-only";

import { analyzeMarketRegime } from "@/engines/regime";
import { analyzeTargets, type TargetHorizon } from "@/engines/targets";
import { financialProviderRouter } from "@/providers";
import { normalizeSymbol } from "@/services/yahoo/symbol-resolver";
import { getFundamentalAnalysis } from "./fundamental-service";
import { getTechnicalAnalysis } from "./technical-service";

export async function getTargetAnalysis(symbolInput: string, horizon: TargetHorizon = "12m") {
  const symbol = normalizeSymbol(decodeURIComponent(symbolInput));
  const [quote, profile, analyst, technicalResult, fundamentalResult] = await Promise.all([
    financialProviderRouter.quote(symbol),
    financialProviderRouter.profile(symbol).catch(() => null),
    financialProviderRouter.analystConsensus(symbol).catch(() => null),
    getTechnicalAnalysis(symbol, horizon === "3m" ? "3m" : horizon === "6m" ? "6m" : horizon === "12m" ? "12m" : "long", "^GSPC"),
    getFundamentalAnalysis(symbol).catch(() => null),
  ]);
  const regime = analyzeMarketRegime(technicalResult.benchmarkAnalysis ?? technicalResult.analysis);
  const analysis = analyzeTargets({
    symbol, horizon, currentPrice: quote.data.price, currency: quote.data.currency,
    instrumentType: profile?.data.quoteType ?? quote.data.quoteType,
    analyst: analyst?.data ?? fundamentalResult?.analysis.inputs.analyst ?? null,
    analystProvider: analyst?.meta.provider ?? fundamentalResult?.provider ?? null,
    technical: technicalResult.analysis, fundamental: fundamentalResult?.analysis ?? null, regime,
  });
  const providerValues = [quote.meta.provider, profile?.meta.provider, analyst?.meta.provider, technicalResult.provider, fundamentalResult?.provider];
  return { analysis, providers: [...new Set(providerValues.flatMap((value) => value ? [value] : []))] };
}
