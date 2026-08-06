import { apiFailure, apiSuccess } from "@/services/yahoo/api-response";
import { fallbackFundamentals } from "@/services/yahoo/mock-fallback";
import { canFallback } from "@/services/yahoo/errors";
import { clientKey, enforceRateLimit } from "@/services/yahoo/rate-limit";
import { normalizeSymbol } from "@/services/yahoo/symbol-resolver";
import { yahooFinanceClient } from "@/services/yahoo/yahoo-finance-client";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    enforceRateLimit(clientKey(request), "fundamentals", 20);
    const symbol = normalizeSymbol(new URL(request.url).searchParams.get("symbol") ?? "");
    try { return apiSuccess(await yahooFinanceClient.fundamentals(symbol), "yahoo"); }
    catch (error) { if (!canFallback(error)) throw error; return apiSuccess(fallbackFundamentals(symbol), "mock", true, "Fondamentali non disponibili; nessun valore è stato inventato."); }
  } catch (error) { return apiFailure(error); }
}
