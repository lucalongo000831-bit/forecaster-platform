import { apiFailure, apiSuccess } from "@/services/yahoo/api-response";
import { fallbackSearch } from "@/services/yahoo/mock-fallback";
import { clientKey, enforceRateLimit } from "@/services/yahoo/rate-limit";
import { normalizeSearchQuery } from "@/services/yahoo/symbol-resolver";
import { yahooFinanceClient } from "@/services/yahoo/yahoo-finance-client";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    enforceRateLimit(clientKey(request), "search", 12);
    const query = normalizeSearchQuery(new URL(request.url).searchParams.get("q") ?? "");
    try {
      return apiSuccess(await yahooFinanceClient.search(query), "yahoo");
    } catch {
      return apiSuccess(fallbackSearch(), "mock", true, "Yahoo Finance non raggiungibile: risultati demo chiaramente identificati.");
    }
  } catch (error) { return apiFailure(error); }
}
