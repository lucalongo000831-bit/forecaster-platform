import { financialProviderRouter } from "@/providers";
import { marketStatusRequestSchema, queryObject } from "@/schemas";
import { createRequestContext } from "@/lib/server/request-context";
import { enforceRateLimit } from "@/lib/server/rate-limit";
import { jsonFailure } from "@/lib/server/api-response";
import { providerApiSuccess } from "@/services/market/api";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const context = createRequestContext(request);
  try {
    await enforceRateLimit(context.ip, { scope: "market:status", limit: 30 });
    const { market } = marketStatusRequestSchema.parse(queryObject(request));
    return providerApiSuccess(await financialProviderRouter.marketStatus(market), context, "public, s-maxage=30, stale-while-revalidate=300");
  } catch (error) { return jsonFailure(error, context); }
}
