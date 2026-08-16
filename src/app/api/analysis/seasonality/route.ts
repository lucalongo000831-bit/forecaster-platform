import { getSeasonalityAnalysis } from "@/services/analysis/seasonality-service";
import { queryObject, seasonalityRequestSchema } from "@/schemas";
import { createRequestContext } from "@/lib/server/request-context";
import { enforceRateLimit } from "@/lib/server/rate-limit";
import { jsonFailure, jsonSuccess } from "@/lib/server/api-response";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET(request: Request) {
  const context = createRequestContext(request);
  try {
    await enforceRateLimit(context.ip, { scope: "analysis:seasonality", limit: 10 });
    const query = seasonalityRequestSchema.parse(queryObject(request));
    const analysis = await getSeasonalityAnalysis(query.symbol, {
      windows: query.windows ?? [query.window],
      selectedMonth: query.month,
      rangeStart: query.rangeStart,
      rangeEnd: query.rangeEnd,
      side: query.side,
      includeCycles: query.includeCycles,
      includeCorrelations: query.includeCorrelations,
      includeTradeStats: query.includeTradeStats,
      includeTable: query.includeTable,
    });
    return jsonSuccess(analysis, context, { headers: { "Cache-Control": "public, s-maxage=21600, stale-while-revalidate=86400" }, meta: { provider: analysis.provider, sourceTimestamp: analysis.dataTimestamp, modelVersion: analysis.modelVersion, dataQuality: analysis.quality } });
  } catch (error) { return jsonFailure(error, context); }
}
