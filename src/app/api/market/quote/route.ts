import { apiFailure, apiSuccess } from "@/services/yahoo/api-response";
import { fallbackQuote } from "@/services/yahoo/mock-fallback";
import { canFallback } from "@/services/yahoo/errors";
import { clientKey, enforceRateLimit } from "@/services/yahoo/rate-limit";
import { normalizeSymbol } from "@/services/yahoo/symbol-resolver";
import { yahooFinanceClient } from "@/services/yahoo/yahoo-finance-client";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    enforceRateLimit(clientKey(request), "quote", 30);
    const symbol = normalizeSymbol(new URL(request.url).searchParams.get("symbol") ?? "");
    try { return apiSuccess(await yahooFinanceClient.quote(symbol), "yahoo"); }
    catch (error) { if (!canFallback(error)) throw error; return apiSuccess(fallbackQuote(symbol), "mock", true, "Quotazione demo: Yahoo Finance non è disponibile."); }
  } catch (error) { return apiFailure(error); }
}
