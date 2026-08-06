import { financialProviderRouter } from "@/providers";
import { chartRequestSchema, queryObject } from "@/schemas";
import { createRequestContext } from "@/lib/server/request-context";
import { enforceRateLimit } from "@/lib/server/rate-limit";
import { jsonFailure } from "@/lib/server/api-response";
import { fallbackChart } from "@/services/yahoo/mock-fallback";
import { mockApiSuccess, providerApiSuccess, rethrowDefinitiveProviderError } from "@/services/market/api";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const context = createRequestContext(request);
  try {
    await enforceRateLimit(context.ip, { scope: "market:chart", limit: 30 });
    const { symbol, range, interval } = chartRequestSchema.parse(queryObject(request));
    try {
      return providerApiSuccess(await financialProviderRouter.chart(symbol, range, interval), context, range === "1D" || range === "5D" ? "public, s-maxage=60, stale-while-revalidate=300" : "public, s-maxage=900, stale-while-revalidate=21600");
    } catch (error) {
      rethrowDefinitiveProviderError(error);
      return mockApiSuccess(fallbackChart(symbol.toUpperCase(), range), context, "Storico demo: provider temporaneamente non disponibile.");
    }
  } catch (error) { return jsonFailure(error, context); }
}
