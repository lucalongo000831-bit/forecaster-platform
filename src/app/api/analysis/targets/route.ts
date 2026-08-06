import { getTargetAnalysis } from "@/services/analysis/target-service";
import { queryObject, targetRequestSchema } from "@/schemas";
import { createRequestContext } from "@/lib/server/request-context";
import { enforceRateLimit } from "@/lib/server/rate-limit";
import { jsonFailure, jsonSuccess } from "@/lib/server/api-response";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const context = createRequestContext(request);
  try {
    await enforceRateLimit(context.ip, { scope: "analysis:targets", limit: 8 });
    const { symbol, horizon } = targetRequestSchema.parse(queryObject(request));
    const result = await getTargetAnalysis(symbol, horizon);
    return jsonSuccess(result.analysis, context, { headers: { "Cache-Control": "public, s-maxage=1800, stale-while-revalidate=21600" }, meta: { providers: result.providers, sourceTimestamp: result.analysis.dataTimestamp, modelVersion: result.analysis.modelVersion } });
  } catch (error) { return jsonFailure(error, context); }
}
