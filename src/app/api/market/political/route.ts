import { z } from "zod";
import { queryObject } from "@/schemas";
import { createRequestContext } from "@/lib/server/request-context";
import { enforceRateLimit } from "@/lib/server/rate-limit";
import { jsonFailure, jsonSuccess } from "@/lib/server/api-response";
import { getPoliticalLeaderboard, getSymbolPoliticalIntelligence } from "@/services/political";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const requestSchema = z.object({ symbol: z.string().trim().min(1).max(32).optional(), chamber: z.enum(["all", "senate", "house"]).default("all"), limit: z.coerce.number().int().min(1).max(200).default(100) });

export async function GET(request: Request) {
  const context = createRequestContext(request);
  try {
    await enforceRateLimit(context.ip, { scope: "market:political", limit: 15 });
    const { symbol, chamber, limit } = requestSchema.parse(queryObject(request));
    const filters = { period: "MAX" as const, chamber: chamber === "all" ? "ALL" as const : chamber.toUpperCase() as "HOUSE" | "SENATE", page: 1, pageSize: Math.min(limit, 100) };
    if (symbol) {
      const report = await getSymbolPoliticalIntelligence(symbol, filters);
      return jsonSuccess(report.transactions.slice(0, limit), context, { headers: { "Cache-Control": "public, s-maxage=900, stale-while-revalidate=3600" }, meta: { providers: report.provenance.providers, sourceMode: report.provenance.sourceMode, databaseStatus: report.provenance.databaseStatus, dataStatus: report.dataStatus, fetchedAt: report.calculatedAt } });
    }
    const report = await getPoliticalLeaderboard(filters);
    return jsonSuccess(report.latest.slice(0, limit), context, { headers: { "Cache-Control": "public, s-maxage=900, stale-while-revalidate=3600" }, meta: { sourceMode: "DATABASE_FIRST", resultStatus: report.resultStatus, fetchedAt: report.calculatedAt } });
  } catch (error) { return jsonFailure(error, context); }
}
