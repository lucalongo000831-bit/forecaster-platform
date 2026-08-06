import { financialProviderRouter } from "@/providers";
import { symbolRequestSchema, queryObject } from "@/schemas";
import { createRequestContext } from "@/lib/server/request-context";
import { enforceRateLimit } from "@/lib/server/rate-limit";
import { jsonFailure } from "@/lib/server/api-response";
import { fallbackNews } from "@/services/yahoo/mock-fallback";
import { mockApiSuccess, providerApiSuccess, rethrowDefinitiveProviderError } from "@/services/market/api";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const context = createRequestContext(request);
  try {
    await enforceRateLimit(context.ip, { scope: "market:news", limit: 20 });
    const { symbol } = symbolRequestSchema.parse(queryObject(request));
    try { return providerApiSuccess(await financialProviderRouter.news(symbol), context, "public, s-maxage=600, stale-while-revalidate=3600"); }
    catch (error) { rethrowDefinitiveProviderError(error); return mockApiSuccess(fallbackNews(), context, "News non disponibili; non vengono mostrate notizie inventate."); }
  } catch (error) { return jsonFailure(error, context); }
}
