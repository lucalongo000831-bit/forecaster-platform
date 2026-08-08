import { financialProviderRouter } from "@/providers";
import { symbolRequestSchema, queryObject } from "@/schemas";
import { createRequestContext } from "@/lib/server/request-context";
import { enforceRateLimit } from "@/lib/server/rate-limit";
import { jsonFailure } from "@/lib/server/api-response";
import { providerApiSuccess } from "@/services/market/api";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const context = createRequestContext(request);
  try {
    await enforceRateLimit(context.ip, { scope: "market:quote", limit: 40 });
    const { symbol } = symbolRequestSchema.parse(queryObject(request));
    return providerApiSuccess(await financialProviderRouter.quote(symbol), context, "public, s-maxage=3, stale-while-revalidate=30, stale-if-error=60");
  } catch (error) { return jsonFailure(error, context); }
}
