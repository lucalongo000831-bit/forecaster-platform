import { getForecastAnalysis } from "@/services/analysis/forecast-service";
import { forecastRequestSchema, queryObject } from "@/schemas";
import { createRequestContext } from "@/lib/server/request-context";
import { enforceRateLimit } from "@/lib/server/rate-limit";
import { jsonFailure, jsonSuccess } from "@/lib/server/api-response";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const context = createRequestContext(request);
  try {
    await enforceRateLimit(context.ip, { scope: "analysis:forecast", limit: 5 });
    const { symbol, horizon, target, stop } = forecastRequestSchema.parse(queryObject(request));
    const result = await getForecastAnalysis(symbol, horizon, target, stop);
    return jsonSuccess(result.analysis, context, { headers: { "Cache-Control": "public, s-maxage=1800, stale-while-revalidate=21600" }, meta: { providers: result.providers, sourceTimestamp: result.analysis.dataTimestamp, modelVersion: result.analysis.modelVersion } });
  } catch (error) { return jsonFailure(error, context); }
}
