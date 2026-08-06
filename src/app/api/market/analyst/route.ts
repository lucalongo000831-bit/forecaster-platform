import { financialProviderRouter } from "@/providers";
import { analystRequestSchema, queryObject } from "@/schemas";
import { createRequestContext } from "@/lib/server/request-context";
import { enforceRateLimit } from "@/lib/server/rate-limit";
import { jsonFailure } from "@/lib/server/api-response";
import { providerApiSuccess } from "@/services/market/api";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const context = createRequestContext(request);
  try {
    await enforceRateLimit(context.ip, { scope: "market:analyst", limit: 15 });
    const { symbol } = analystRequestSchema.parse(queryObject(request));
    return providerApiSuccess(await financialProviderRouter.analystConsensus(symbol), context, "public, s-maxage=21600, stale-while-revalidate=172800");
  } catch (error) { return jsonFailure(error, context); }
}
