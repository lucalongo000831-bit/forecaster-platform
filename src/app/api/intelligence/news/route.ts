import { getNewsIntelligence } from "@/services/intelligence/news-service";
import { newsIntelligenceRequestSchema, queryObject } from "@/schemas";
import { createRequestContext } from "@/lib/server/request-context";
import { enforceRateLimit } from "@/lib/server/rate-limit";
import { jsonFailure, jsonSuccess } from "@/lib/server/api-response";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const context = createRequestContext(request);
  try {
    await enforceRateLimit(context.ip, { scope: "intelligence:news", limit: 10 });
    const { symbol, limit } = newsIntelligenceRequestSchema.parse(queryObject(request));
    const result = await getNewsIntelligence(symbol, limit);
    return jsonSuccess(result.analysis, context, { headers: { "Cache-Control": "public, s-maxage=600, stale-while-revalidate=3600" }, meta: { provider: result.meta.provider, sourceTimestamp: result.analysis.sourceTimestamp, modelVersion: result.analysis.modelVersion } });
  } catch (error) { return jsonFailure(error, context); }
}
