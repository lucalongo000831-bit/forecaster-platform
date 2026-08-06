import { getFundamentalAnalysis } from "@/services/analysis/fundamental-service";
import { queryObject, symbolRequestSchema } from "@/schemas";
import { createRequestContext } from "@/lib/server/request-context";
import { enforceRateLimit } from "@/lib/server/rate-limit";
import { jsonFailure, jsonSuccess } from "@/lib/server/api-response";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const context = createRequestContext(request);
  try {
    await enforceRateLimit(context.ip, { scope: "analysis:fundamental", limit: 10 });
    const { symbol } = symbolRequestSchema.parse(queryObject(request));
    const { analysis, provider } = await getFundamentalAnalysis(symbol);
    return jsonSuccess(analysis, context, { headers: { "Cache-Control": "public, s-maxage=21600, stale-while-revalidate=172800" }, meta: { provider, sourceTimestamp: analysis.dataTimestamp, modelVersion: analysis.modelVersion, dataQuality: analysis.confidence } });
  } catch (error) { return jsonFailure(error, context); }
}
