import { createRequestContext, enforceRateLimit, jsonFailure, jsonSuccess } from "@/lib/server";
import { getGlobalRiskCurrent } from "@/services/global-risk";
export const runtime = "nodejs"; export const dynamic = "force-dynamic"; export const maxDuration = 60;
export async function GET(request: Request) { const context = createRequestContext(request); try { await enforceRateLimit(context.ip, { scope: "global-risk:current", limit: 30 }); const data = await getGlobalRiskCurrent(); return jsonSuccess(data, context, { headers: { "Cache-Control": "public, s-maxage=300, stale-while-revalidate=300" }, meta: { modelVersion: data.modelVersion, sourceTimestamp: data.inputTimestamp } }); } catch (error) { return jsonFailure(error, context); } }
