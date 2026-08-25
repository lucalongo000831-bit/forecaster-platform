import "server-only";

import { applyCanonicalPricePolicy, resampleFourHourBars, sanitizeTechnicalBars, TECHNICAL_TIMEFRAMES } from "@/engines/technical";
import { financialProviderRouter } from "@/providers";
import type { ProviderResult } from "@/providers/types";
import { resolveInstrument } from "@/services/instruments/instrument-resolver";
import { normalizeSymbol } from "@/services/yahoo/symbol-resolver";
import { TECHNICAL_CHART_MODEL_VERSION, type ChartInterval, type ChartRange, type TechnicalChartDataset, type TechnicalTimeframe } from "@/types";

const REQUESTS: Record<TechnicalTimeframe, { range: ChartRange; interval: ChartInterval }> = {
  "1m": { range: "1D", interval: "1m" },
  "5m": { range: "5D", interval: "5m" },
  "15m": { range: "5D", interval: "15m" },
  "30m": { range: "1M", interval: "30m" },
  "1h": { range: "1M", interval: "1h" },
  "4h": { range: "1M", interval: "1h" },
  "1D": { range: "1Y", interval: "1d" },
  "1W": { range: "5Y", interval: "1wk" },
};

export async function getTechnicalChartDataset(symbolInput: string, timeframe: TechnicalTimeframe): Promise<ProviderResult<TechnicalChartDataset>> {
  const symbol = normalizeSymbol(decodeURIComponent(symbolInput));
  const request = REQUESTS[timeframe];
  const [chart, instrument] = await Promise.all([
    financialProviderRouter.chart(symbol, request.range, request.interval),
    resolveInstrument(symbol).catch(() => null),
  ]);
  const rawBars = timeframe === "4h" ? resampleFourHourBars(chart.data.points) : sanitizeTechnicalBars(chart.data.points);
  const canonical = timeframe === "1D" || timeframe === "1W"
    ? applyCanonicalPricePolicy(rawBars, instrument?.kind ?? (symbol.endsWith("-USD") ? "CRYPTO" : "EQUITY"))
    : { bars: rawBars, policy: "RAW_OHLC" as const };
  if (canonical.bars.length < 2) throw new Error(timeframe === "4h" ? "INSUFFICIENT_COMPLETE_1H_BARS_FOR_4H" : "INSUFFICIENT_TECHNICAL_CHART_DATA");
  return {
    meta: chart.meta,
    data: {
      symbol,
      currency: chart.data.currency,
      exchange: chart.data.exchange,
      timeframe,
      modelVersion: TECHNICAL_CHART_MODEL_VERSION,
      pricePolicy: canonical.policy,
      bars: canonical.bars,
      availability: TECHNICAL_TIMEFRAMES.map((value) => ({ timeframe: value, available: true, reason: null, calculated: value === "4h" })),
      isDelayed: chart.data.isDelayed,
      asOf: chart.data.asOf ?? canonical.bars.at(-1)?.timestamp ?? null,
      source: chart.meta.provider,
    },
  };
}
