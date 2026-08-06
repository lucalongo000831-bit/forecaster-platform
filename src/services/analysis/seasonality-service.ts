import "server-only";

import { analyzeSeasonality, type SeasonalityWindow } from "@/engines/seasonality";
import { financialProviderRouter } from "@/providers";
import { normalizeSymbol } from "@/services/yahoo/symbol-resolver";

export async function getSeasonalityAnalysis(symbolInput: string, window: SeasonalityWindow = "20Y") {
  const symbol = normalizeSymbol(decodeURIComponent(symbolInput));
  const chart = await financialProviderRouter.analyticsChart(symbol, "MAX", "1d");
  return analyzeSeasonality(symbol, chart.data.points, window, chart.meta.provider);
}
