import { z } from "zod";
import { createRequestContext, enforceRateLimit, jsonFailure, jsonSuccess } from "@/lib/server";
import { getGlobalRiskHistory } from "@/services/global-risk";
export const runtime = "nodejs"; export const dynamic = "force-dynamic";
const rangeSchema = z.enum(["1D", "5D", "1M", "3M", "6M", "1Y", "MAX"]);
export async function GET(request: Request) { const context = createRequestContext(request); try { await enforceRateLimit(context.ip, { scope: "global-risk:history", limit: 30 }); const range = rangeSchema.catch("1M").parse(new URL(request.url).searchParams.get("range") ?? "1M"); return jsonSuccess(await getGlobalRiskHistory(range), context, { headers: { "Cache-Control": "public, s-maxage=300, stale-while-revalidate=900" } }); } catch (error) { return jsonFailure(error, context); } }
