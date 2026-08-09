import { createRequestContext, jsonFailure, jsonSuccess } from "@/lib/server";
import { getGlobalRiskCurrent } from "@/services/global-risk";
export const runtime = "nodejs"; export const dynamic = "force-dynamic";
export async function GET(request: Request) { const context = createRequestContext(request); try { const data = await getGlobalRiskCurrent(); return jsonSuccess({ escalation: data.escalationTriggers, deEscalation: data.deEscalationTriggers }, context, { headers: { "Cache-Control": "public, s-maxage=300, stale-while-revalidate=300" }, meta: { modelVersion: data.modelVersion } }); } catch (error) { return jsonFailure(error, context); } }
