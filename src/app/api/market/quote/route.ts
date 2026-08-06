import { financialProviderRouter } from "@/providers";
import { symbolRequestSchema, queryObject } from "@/schemas";
import { createRequestContext } from "@/lib/server/request-context";
import { enforceRateLimit } from "@/lib/server/rate-limit";
import { jsonFailure } from "@/lib/server/api-response";
import { fallbackQuote } from "@/services/yahoo/mock-fallback";
import { mockApiSuccess, providerApiSuccess, rethrowDefinitiveProviderError } from "@/services/market/api";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const context = createRequestContext(request);
  try {
    await enforceRateLimit(context.ip, { scope: "market:quote", limit: 40 });
    const { symbol } = symbolRequestSchema.parse(queryObject(request));
    try {
      return providerApiSuccess(await financialProviderRouter.quote(symbol), context, "public, s-maxage=20, stale-while-revalidate=120, stale-if-error=3600");
    } catch (error) {
      rethrowDefinitiveProviderError(error);
      return mockApiSuccess(fallbackQuote(symbol.toUpperCase()), context, "Quotazione demo: provider temporaneamente non disponibile.");
    }
  } catch (error) { return jsonFailure(error, context); }
}
