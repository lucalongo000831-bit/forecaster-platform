import { financialProviderRouter } from "@/providers";
import { symbolRequestSchema, queryObject } from "@/schemas";
import { createRequestContext } from "@/lib/server/request-context";
import { enforceRateLimit } from "@/lib/server/rate-limit";
import { jsonFailure } from "@/lib/server/api-response";
import { fallbackProfile } from "@/services/yahoo/mock-fallback";
import { mockApiSuccess, providerApiSuccess, rethrowDefinitiveProviderError } from "@/services/market/api";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const context = createRequestContext(request);
  try {
    await enforceRateLimit(context.ip, { scope: "market:profile", limit: 30 });
    const { symbol } = symbolRequestSchema.parse(queryObject(request));
    try { return providerApiSuccess(await financialProviderRouter.profile(symbol), context, "public, s-maxage=86400, stale-while-revalidate=604800"); }
    catch (error) { rethrowDefinitiveProviderError(error); return mockApiSuccess(fallbackProfile(symbol.toUpperCase()), context, "Profilo demo: provider temporaneamente non disponibile."); }
  } catch (error) { return jsonFailure(error, context); }
}
