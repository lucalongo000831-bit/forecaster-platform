import { getSignalAnalysis } from "@/services/analysis/signal-service";
import { queryObject, signalRequestSchema } from "@/schemas";
import { createRequestContext } from "@/lib/server/request-context";
import { enforceRateLimit } from "@/lib/server/rate-limit";
import { jsonFailure, jsonSuccess } from "@/lib/server/api-response";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const context = createRequestContext(request);
  try {
    await enforceRateLimit(context.ip, { scope: "analysis:signal", limit: 8 });
    const { symbol, horizon } = signalRequestSchema.parse(queryObject(request));
    const result = await getSignalAnalysis(symbol, horizon);
    return jsonSuccess(result.analysis, context, {
      headers: { "Cache-Control": "public, s-maxage=300, stale-while-revalidate=1800" },
      meta: { providers: result.providers, sourceTimestamp: result.analysis.dataTimestamp, modelVersion: result.analysis.modelVersion, dataQuality: result.analysis.dataQuality },
    });
  } catch (error) { return jsonFailure(error, context); }
}
