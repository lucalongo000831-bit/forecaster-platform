import { financialProviderRouter } from "@/providers";
import { earningsRequestSchema, queryObject } from "@/schemas";
import { createRequestContext } from "@/lib/server/request-context";
import { enforceRateLimit } from "@/lib/server/rate-limit";
import { jsonFailure } from "@/lib/server/api-response";
import { providerApiSuccess } from "@/services/market/api";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const context = createRequestContext(request);
  try {
    await enforceRateLimit(context.ip, { scope: "market:events", limit: 15 });
    const { from, to, symbol } = earningsRequestSchema.parse(queryObject(request));
    return providerApiSuccess(await financialProviderRouter.earningsCalendar(from, to, symbol), context, "public, s-maxage=3600, stale-while-revalidate=21600");
  } catch (error) { return jsonFailure(error, context); }
}
