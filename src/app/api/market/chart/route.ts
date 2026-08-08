import { financialProviderRouter } from "@/providers";
import { chartRequestSchema, queryObject } from "@/schemas";
import { createRequestContext } from "@/lib/server/request-context";
import { enforceRateLimit } from "@/lib/server/rate-limit";
import { jsonFailure } from "@/lib/server/api-response";
import { providerApiSuccess } from "@/services/market/api";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const context = createRequestContext(request);
  try {
    await enforceRateLimit(context.ip, { scope: "market:chart", limit: 30 });
    const { symbol, range, interval } = chartRequestSchema.parse(queryObject(request));
    return providerApiSuccess(await financialProviderRouter.chart(symbol, range, interval), context, range === "1D" || range === "5D" ? "public, s-maxage=10, stale-while-revalidate=60" : "public, s-maxage=900, stale-while-revalidate=21600");
  } catch (error) { return jsonFailure(error, context); }
}
