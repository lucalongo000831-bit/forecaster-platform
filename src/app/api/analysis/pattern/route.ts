import { getPatternAnalysis } from "@/services/analysis/pattern-service";
import { patternRequestSchema, queryObject } from "@/schemas";
import { createRequestContext } from "@/lib/server/request-context";
import { enforceRateLimit } from "@/lib/server/rate-limit";
import { jsonFailure, jsonSuccess } from "@/lib/server/api-response";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET(request: Request) {
  const context = createRequestContext(request);
  try {
    await enforceRateLimit(context.ip, { scope: "analysis:pattern", limit: 10 });
    const query = patternRequestSchema.parse(queryObject(request));
    const analysis = await getPatternAnalysis(query.symbol, { referenceDate: query.referenceDate, lookback: query.lookback });
    return jsonSuccess(analysis, context, {
      headers: { "Cache-Control": "public, s-maxage=21600, stale-while-revalidate=86400" },
      meta: {
        provider: analysis.metadata.provider,
        sourceTimestamp: analysis.metadata.sourceTimestamp,
        modelVersion: analysis.modelVersion,
        dataQuality: analysis.quality.quality,
      },
    });
  } catch (error) {
    return jsonFailure(error, context);
  }
}
