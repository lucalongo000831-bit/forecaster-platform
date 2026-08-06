import { financialProviderRouter } from "@/providers";
import { queryObject, quotesRequestSchema } from "@/schemas";
import { createRequestContext } from "@/lib/server/request-context";
import { enforceRateLimit } from "@/lib/server/rate-limit";
import { jsonFailure } from "@/lib/server/api-response";
import { providerApiSuccess } from "@/services/market/api";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const context = createRequestContext(request);
  try {
    await enforceRateLimit(context.ip, { scope: "market:quotes", limit: 20 });
    const { symbols } = quotesRequestSchema.parse(queryObject(request));
    return providerApiSuccess(await financialProviderRouter.quotes(symbols), context, "public, s-maxage=20, stale-while-revalidate=120");
  } catch (error) { return jsonFailure(error, context); }
}
