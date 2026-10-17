import "server-only";

import { applyCanonicalPricePolicy, sanitizeTechnicalBars, TECHNICAL_TIMEFRAMES } from "@/engines/technical";
import { exchangeSession, historyCoverage, requestedHistoryBounds, resampleSessionBars, TIMEFRAME_MINUTES } from "@/engines/technical/history-v5";
import { financialProviderRouter } from "@/providers";
import type { ProviderResult } from "@/providers/types";
import { normalizeSymbol } from "@/services/yahoo/symbol-resolver";
import { AppError } from "@/lib/server/app-error";
import { TECHNICAL_CHART_MODEL_VERSION, type ChartRange, type TechnicalChartDataset, type TechnicalHistoricalRange, type TechnicalTimeframe } from "@/types";

const DAY = 86_400_000;
export async function getTechnicalChartDataset(symbolInput: string, timeframe: TechnicalTimeframe, range?: ChartRange, custom?: { from?: string; to?: string }, warmup = 500): Promise<ProviderResult<TechnicalChartDataset>> {
  const symbol = normalizeSymbol(decodeURIComponent(symbolInput));
  const requestedRange: TechnicalHistoricalRange = custom?.from && custom?.to ? "CUSTOM" : range ?? (["1D", "1W"].includes(timeframe) ? "1Y" : timeframe === "1m" ? "1D" : "1M");
  const now = new Date(Math.floor(Date.now() / 60_000) * 60_000);
  let bounds: { from: string; to: string };
  try { bounds = requestedHistoryBounds(requestedRange, now, custom); }
  catch { throw new AppError("BAD_REQUEST", "Select valid From and To dates within available history.", 400); }
  const session = exchangeSession(symbol);
  const intraday = TIMEFRAME_MINUTES[timeframe] < 1440;
  const maxDays = timeframe === "1m" ? 7 : ["5m", "15m", "30m"].includes(timeframe) ? 59 : 729;
  if (intraday && (now.getTime() - Date.parse(bounds.from)) / DAY > maxDays) throw new AppError("BAD_REQUEST", `RANGE_INTERVAL_UNAVAILABLE: ${timeframe} history is supported within ${maxDays} days. Your previous verified chart is retained.`, 422);
  const warmupBars = Math.max(0, Math.min(2500, Math.floor(warmup)));
  const warmupDays = timeframe === "1W" ? warmupBars * 7 + 14 : timeframe === "1D" ? warmupBars * (session.crypto ? 1 : 1.5) + 14 : warmupBars * TIMEFRAME_MINUTES[timeframe] / (session.close - session.open) * (session.crypto ? 1 : 1.6) + 14;
  const calculationFrom = new Date(Math.max(0, Date.parse(bounds.from) - warmupDays * DAY, intraday ? now.getTime() - maxDays * DAY : 0)).toISOString();
  // Half-hour constituents avoid mixing pre-market and regular-session hourly prices.
  const interval = timeframe === "4h" ? session.crypto ? "1h" : "30m" : timeframe === "1h" && !session.crypto ? "30m" : timeframe === "1D" ? "1d" : timeframe === "1W" ? "1wk" : timeframe;
  const chart = await financialProviderRouter.technicalHistory(symbol, requestedRange === "CUSTOM" ? "MAX" : requestedRange, interval, { from: calculationFrom, to: bounds.to }, ["1h", "4h"].includes(timeframe));
  const source = sanitizeTechnicalBars(chart.data.points);
  const resampled = ["1h", "4h"].includes(timeframe) ? resampleSessionBars(source, TIMEFRAME_MINUTES[timeframe], chart.data.interval === "30m" ? 30 : 60, symbol, chart.data.exchange) : { bars: source, missing: [], session };
  const canonical = ["1D", "1W"].includes(timeframe) ? applyCanonicalPricePolicy(resampled.bars, session.crypto ? "CRYPTO" : "EQUITY") : { bars: resampled.bars, policy: "RAW_OHLC" as const };
  const bars = canonical.bars.filter((bar) => Date.parse(bar.timestamp) >= Date.parse(bounds.from) && Date.parse(bar.timestamp) <= Date.parse(bounds.to));
  if (!bars.length) throw new AppError("NO_DATA", "No verified candles are available in this interval and historical range. Previous chart retained.", 404);
  const calculationBars = canonical.bars.filter((bar) => Date.parse(bar.timestamp) <= Date.parse(bounds.to));
  const availableBars = calculationBars.filter((bar) => Date.parse(bar.timestamp) < Date.parse(bars[0].timestamp)).length;
  const limitations = [...(chart.data.historyLimitations ?? [])];
  if (!session.known) limitations.push("Exchange session calendar is unverified.");
  if (!session.crypto) limitations.push("Returned candles and detected gaps are verified; complete session/holiday coverage is not independently certified.");
  if (requestedRange === "MAX") limitations.push("Maximum returned history; pre-listing completeness is not independently certified.");
  const coverage = historyCoverage(bars, timeframe, bounds, chart.meta.provider, chart.meta.freshnessType ?? chart.meta.freshness, resampled.missing.filter((gap) => gap.to >= bounds.from), limitations, session.crypto);
  return { meta: chart.meta, data: {
    symbol, currency: chart.data.currency, exchange: chart.data.exchange, timeframe, modelVersion: TECHNICAL_CHART_MODEL_VERSION,
    pricePolicy: canonical.policy, bars, calculationBars, coverage,
    warmup: { requestedBars: warmupBars, availableBars, status: availableBars >= warmupBars ? "READY" : "LIMITED", policy: "SMA needs N−1 prior bars; EMA/SMMA use an SMA seed and up to 10×N prior bars for convergence. No pre-listing data is fabricated." },
    availability: TECHNICAL_TIMEFRAMES.map((value) => ({ timeframe: value, available: true, reason: "Availability depends on requested dates and provider entitlements.", calculated: value === "4h" || value === "1h" && !session.crypto })),
    isDelayed: chart.data.isDelayed, asOf: chart.data.asOf ?? bars.at(-1)!.timestamp, source: chart.meta.provider,
    range: requestedRange === "CUSTOM" ? "MAX" : requestedRange, requestedRange, historyStart: bars[0].timestamp, historyEnd: bars.at(-1)!.timestamp,
    rangeAvailability: coverage.coverageStatus === "COMPLETE" ? "AVAILABLE" : coverage.coverageStatus,
    rangeMessage: coverage.coverageStatus === "COMPLETE" ? null : [...limitations, coverage.missingSegments.length ? `${coverage.missingSegments.length} incomplete source buckets excluded.` : "Coverage is limited to verified returned observations."].join(" "),
  } };
}
