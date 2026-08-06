import type { ChartRange } from "@/types";
import { apiFailure, apiSuccess } from "@/services/yahoo/api-response";
import { FinancialDataError } from "@/services/yahoo/errors";
import { canFallback } from "@/services/yahoo/errors";
import { fallbackChart } from "@/services/yahoo/mock-fallback";
import { clientKey, enforceRateLimit } from "@/services/yahoo/rate-limit";
import { normalizeSymbol } from "@/services/yahoo/symbol-resolver";
import { resolveChartInterval, yahooFinanceClient } from "@/services/yahoo/yahoo-finance-client";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const ranges = new Set<ChartRange>(["1D", "5D", "1M", "6M", "YTD", "1Y", "5Y", "MAX"]);

export async function GET(request: Request) {
  try {
    enforceRateLimit(clientKey(request), "chart", 24);
    const params = new URL(request.url).searchParams;
    const symbol = normalizeSymbol(params.get("symbol") ?? "");
    const range = (params.get("range") || "1Y").toUpperCase() as ChartRange;
    if (!ranges.has(range)) throw new FinancialDataError("INVALID_QUERY", "Periodo grafico non supportato.", 400);
    const interval = resolveChartInterval(range, params.get("interval"));
    try { return apiSuccess(await yahooFinanceClient.chart(symbol, range, interval), "yahoo"); }
    catch (error) { if (!canFallback(error)) throw error; return apiSuccess(fallbackChart(symbol, range), "mock", true, "Storico demo: Yahoo Finance non è disponibile."); }
  } catch (error) { return apiFailure(error); }
}
