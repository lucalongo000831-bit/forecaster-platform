import { financialProviderRouter } from "@/providers";
import { symbolRequestSchema, queryObject } from "@/schemas";
import { createRequestContext } from "@/lib/server/request-context";
import { enforceRateLimit } from "@/lib/server/rate-limit";
import { jsonFailure } from "@/lib/server/api-response";
import { fallbackFundamentals } from "@/services/yahoo/mock-fallback";
import { mockApiSuccess, providerApiSuccess, rethrowDefinitiveProviderError } from "@/services/market/api";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const context = createRequestContext(request);
  try {
    await enforceRateLimit(context.ip, { scope: "market:fundamentals", limit: 25 });
    const { symbol } = symbolRequestSchema.parse(queryObject(request));
    try { return providerApiSuccess(await financialProviderRouter.fundamentals(symbol), context, "public, s-maxage=21600, stale-while-revalidate=172800"); }
    catch (error) { rethrowDefinitiveProviderError(error); return mockApiSuccess(fallbackFundamentals(symbol.toUpperCase()), context, "Fondamentali non disponibili; nessun valore è stato inventato."); }
  } catch (error) { return jsonFailure(error, context); }
}
