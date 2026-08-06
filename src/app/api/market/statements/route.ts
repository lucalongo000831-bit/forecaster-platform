import { financialProviderRouter } from "@/providers";
import { queryObject, statementsRequestSchema } from "@/schemas";
import { createRequestContext } from "@/lib/server/request-context";
import { enforceRateLimit } from "@/lib/server/rate-limit";
import { jsonFailure } from "@/lib/server/api-response";
import { providerApiSuccess } from "@/services/market/api";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const context = createRequestContext(request);
  try {
    await enforceRateLimit(context.ip, { scope: "market:statements", limit: 15 });
    const { symbol, statement, period, limit } = statementsRequestSchema.parse(queryObject(request));
    return providerApiSuccess(await financialProviderRouter.statements(symbol, statement, period, limit), context, "public, s-maxage=21600, stale-while-revalidate=604800");
  } catch (error) { return jsonFailure(error, context); }
}
