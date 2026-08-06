import { apiFailure, apiSuccess } from "@/services/yahoo/api-response";
import { fallbackNews } from "@/services/yahoo/mock-fallback";
import { canFallback } from "@/services/yahoo/errors";
import { clientKey, enforceRateLimit } from "@/services/yahoo/rate-limit";
import { normalizeSymbol } from "@/services/yahoo/symbol-resolver";
import { yahooFinanceClient } from "@/services/yahoo/yahoo-finance-client";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    enforceRateLimit(clientKey(request), "news", 20);
    const symbol = normalizeSymbol(new URL(request.url).searchParams.get("symbol") ?? "");
    try { return apiSuccess(await yahooFinanceClient.news(symbol), "yahoo"); }
    catch (error) { if (!canFallback(error)) throw error; return apiSuccess(fallbackNews(), "mock", true, "News non disponibili; non vengono mostrate notizie inventate."); }
  } catch (error) { return apiFailure(error); }
}
