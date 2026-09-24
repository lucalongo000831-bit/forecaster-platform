import "server-only";

import { applyCanonicalPricePolicy, resampleFourHourBars, sanitizeTechnicalBars, TECHNICAL_TIMEFRAMES } from "@/engines/technical";
import { financialProviderRouter } from "@/providers";
import type { ProviderResult } from "@/providers/types";
import { resolveInstrument } from "@/services/instruments/instrument-resolver";
import { normalizeSymbol } from "@/services/yahoo/symbol-resolver";
import { TECHNICAL_CHART_MODEL_VERSION, type ChartInterval, type ChartRange, type TechnicalChartDataset, type TechnicalHistoricalRange, type TechnicalTimeframe } from "@/types";

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

const RANGE_ORDER: ChartRange[] = ["1D", "5D", "1M", "3M", "6M", "YTD", "1Y", "3Y", "5Y", "10Y", "MAX"];
const LONG_RANGE_YEARS: Partial<Record<ChartRange, number>> = { "3Y": 3, "5Y": 5, "10Y": 10, MAX: 25 };
function requestFor(timeframe: TechnicalTimeframe, range?: ChartRange) {
  const selected = range ?? REQUESTS[timeframe].range;
  const intraday = ["1m", "5m", "15m", "30m", "1h", "4h"].includes(timeframe);
  const allowed: Record<TechnicalTimeframe, ChartRange[]> = {
    "1m": ["1D"], "5m": ["1D", "5D"], "15m": ["1D", "5D", "1M"], "30m": ["1D", "5D", "1M"],
    "1h": ["1D", "5D", "1M", "3M"], "4h": ["1M", "3M"], "1D": RANGE_ORDER, "1W": ["3M", "6M", "YTD", "1Y", "3Y", "5Y", "10Y", "MAX"],
  };
  if (!allowed[timeframe].includes(selected)) throw new Error(`RANGE_INTERVAL_UNAVAILABLE: ${selected} + ${timeframe}`);
  const interval: ChartInterval = timeframe === "4h" ? "1h" : timeframe === "1D" ? "1d" : timeframe === "1W" ? "1wk" : timeframe;
  return { range: selected, interval, intraday };
}

export async function getTechnicalChartDataset(symbolInput: string, timeframe: TechnicalTimeframe, range?: ChartRange, custom?: { from?: string; to?: string }): Promise<ProviderResult<TechnicalChartDataset>> {
  const symbol = normalizeSymbol(decodeURIComponent(symbolInput));
  const requestedRange: TechnicalHistoricalRange = custom?.from && custom?.to ? "CUSTOM" : range ?? REQUESTS[timeframe].range;
  const request = requestFor(timeframe, requestedRange === "CUSTOM" ? "MAX" : requestedRange);
  const preferredYears = LONG_RANGE_YEARS[request.range];
  const [chart, instrument] = await Promise.all([
    preferredYears
      ? financialProviderRouter.technicalChart(symbol, request.range, request.interval, preferredYears)
      : financialProviderRouter.chart(symbol, request.range, request.interval),
    resolveInstrument(symbol).catch(() => null),
  ]);
  const sliced = chart.data.points.filter((bar) => (!custom?.from || bar.timestamp.slice(0, 10) >= custom.from) && (!custom?.to || bar.timestamp.slice(0, 10) <= custom.to));
  const rawBars = timeframe === "4h" ? resampleFourHourBars(sliced) : sanitizeTechnicalBars(sliced);
  const canonical = timeframe === "1D" || timeframe === "1W"
    ? applyCanonicalPricePolicy(rawBars, instrument?.kind ?? (symbol.endsWith("-USD") ? "CRYPTO" : "EQUITY"))
    : { bars: rawBars, policy: "RAW_OHLC" as const };
  if (canonical.bars.length < 1) throw new Error(timeframe === "4h" ? "INSUFFICIENT_COMPLETE_1H_BARS_FOR_4H" : "INSUFFICIENT_TECHNICAL_CHART_DATA");
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
      range: request.range,
      requestedRange,
      historyStart: canonical.bars[0]?.timestamp ?? null,
      historyEnd: canonical.bars.at(-1)?.timestamp ?? null,
      rangeAvailability: requestedRange === "MAX" && request.range === "MAX" ? "AVAILABLE" : "AVAILABLE",
      rangeMessage: requestedRange === "MAX" ? "Maximum history currently available in Kairo." : null,
    },
  };
}
