import { getSeasonalityAnalysis } from "@/services/analysis/seasonality-service";
import { queryObject, seasonalityRequestSchema } from "@/schemas";
import { createRequestContext } from "@/lib/server/request-context";
import { enforceRateLimit } from "@/lib/server/rate-limit";
import { jsonFailure, jsonSuccess } from "@/lib/server/api-response";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const context = createRequestContext(request);
  try {
    await enforceRateLimit(context.ip, { scope: "analysis:seasonality", limit: 10 });
    const { symbol, window } = seasonalityRequestSchema.parse(queryObject(request));
    const analysis = await getSeasonalityAnalysis(symbol, window);
    return jsonSuccess(analysis, context, { headers: { "Cache-Control": "public, s-maxage=3600, stale-while-revalidate=21600" }, meta: { provider: analysis.provider, sourceTimestamp: analysis.dataTimestamp, modelVersion: analysis.modelVersion, dataQuality: analysis.quality } });
  } catch (error) { return jsonFailure(error, context); }
}
