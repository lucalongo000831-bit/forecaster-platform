import { financialProviderRouter } from "@/providers";
import { searchRequestSchema, queryObject } from "@/schemas";
import { createRequestContext } from "@/lib/server/request-context";
import { enforceRateLimit } from "@/lib/server/rate-limit";
import { jsonFailure } from "@/lib/server/api-response";
import { fallbackSearch } from "@/services/yahoo/mock-fallback";
import { mockApiSuccess, providerApiSuccess } from "@/services/market/api";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const context = createRequestContext(request);
  try {
    await enforceRateLimit(context.ip, { scope: "market:search", limit: 15 });
    const { q } = searchRequestSchema.parse(queryObject(request));
    try {
      return providerApiSuccess(await financialProviderRouter.search(q), context, "public, s-maxage=300, stale-while-revalidate=1800");
    } catch {
      return mockApiSuccess(fallbackSearch(), context, "Provider non raggiungibile: risultati demo chiaramente identificati.");
    }
  } catch (error) { return jsonFailure(error, context); }
}
