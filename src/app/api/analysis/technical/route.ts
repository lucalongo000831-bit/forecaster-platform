import { getTechnicalAnalysis } from "@/services/analysis/technical-service";
import { queryObject, technicalRequestSchema } from "@/schemas";
import { createRequestContext } from "@/lib/server/request-context";
import { enforceRateLimit } from "@/lib/server/rate-limit";
import { jsonFailure, jsonSuccess } from "@/lib/server/api-response";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const context = createRequestContext(request);
  try {
    await enforceRateLimit(context.ip, { scope: "analysis:technical", limit: 15 });
    const { symbol, horizon, benchmark } = technicalRequestSchema.parse(queryObject(request));
    const result = await getTechnicalAnalysis(symbol, horizon, benchmark);
    const analysis = result.analysis;
    const { input: _input, ...payload } = analysis;
    void _input;
    return jsonSuccess({ ...payload, horizon }, context, { headers: { "Cache-Control": "public, s-maxage=300, stale-while-revalidate=1800" }, meta: { provider: result.provider, sourceTimestamp: result.sourceTimestamp, modelVersion: analysis.modelVersion, dataQuality: analysis.completeness >= 80 ? "HIGH" : analysis.completeness >= 55 ? "MEDIUM" : "LOW" } });
  } catch (error) { return jsonFailure(error, context); }
}
