import { politicalFiltersSchema, queryObject } from "@/schemas";
import { getPoliticalLeaderboard, getSymbolPoliticalIntelligence, politicalCsv } from "@/services/political";
import { createRequestContext, enforceRateLimit, jsonFailure, jsonSuccess } from "@/lib/server";

export const runtime = "nodejs"; export const dynamic = "force-dynamic"; export const maxDuration = 60;

export async function GET(request: Request) {
  const context = createRequestContext(request);
  try {
    await enforceRateLimit(context.ip, { scope: "political-intelligence", limit: 30 });
    const filters = politicalFiltersSchema.parse(queryObject(request));
    if (filters.symbol) {
      const report = await getSymbolPoliticalIntelligence(filters.symbol, filters);
      if (filters.format === "csv") return new Response(politicalCsv(report.transactions), { headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="${filters.symbol}-congressional-disclosures.csv"`, "Cache-Control": "private, no-store" } });
      return jsonSuccess(report, context, { headers: { "Cache-Control": "public, s-maxage=3600, stale-while-revalidate=21600" }, meta: { provider: "fmp", modelVersion: report.summary.modelVersion, dataCompleteness: report.summary.dataCompleteness } });
    }
    const report = await getPoliticalLeaderboard(filters);
    if (filters.format === "csv") return new Response(politicalCsv(report.latest), { headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": "attachment; filename=congressional-disclosures.csv", "Cache-Control": "private, no-store" } });
    return jsonSuccess(report, context, { headers: { "Cache-Control": "public, s-maxage=3600, stale-while-revalidate=21600" }, meta: { provider: "fmp", modelVersion: report.summary.modelVersion, dataCompleteness: report.dataCompleteness } });
  } catch (error) { return jsonFailure(error, context); }
}
