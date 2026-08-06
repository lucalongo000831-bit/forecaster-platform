import { analyzeTechnical } from "@/engines/technical";
import { financialProviderRouter } from "@/providers";
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
    const [chart, benchmarkChart] = await Promise.all([
      financialProviderRouter.chart(symbol, "5Y", "1d"),
      symbol.toUpperCase() === benchmark.toUpperCase() ? Promise.resolve(null) : financialProviderRouter.chart(benchmark, "5Y", "1d").catch(() => null),
    ]);
    const analysis = analyzeTechnical(symbol.toUpperCase(), chart.data.points, benchmarkChart ? { symbol: benchmark.toUpperCase(), bars: benchmarkChart.data.points } : undefined);
    const { input: _input, ...payload } = analysis;
    void _input;
    return jsonSuccess({ ...payload, horizon }, context, { headers: { "Cache-Control": "public, s-maxage=300, stale-while-revalidate=1800" }, meta: { provider: chart.meta.provider, sourceTimestamp: chart.meta.sourceTimestamp, modelVersion: analysis.modelVersion, dataQuality: analysis.completeness >= 80 ? "HIGH" : analysis.completeness >= 55 ? "MEDIUM" : "LOW" } });
  } catch (error) { return jsonFailure(error, context); }
}
