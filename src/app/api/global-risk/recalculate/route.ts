import { assertSameOrigin, createRequestContext, enforceRateLimit, jsonFailure, jsonSuccess } from "@/lib/server";
import { requireUser } from "@/lib/server/auth";
import { getGlobalRiskCurrent } from "@/services/global-risk";
export const runtime = "nodejs"; export const dynamic = "force-dynamic"; export const maxDuration = 60;
export async function POST(request: Request) { const context = createRequestContext(request); try { assertSameOrigin(request); const user = await requireUser(); await enforceRateLimit(`${context.ip}:${user.id}`, { scope: "global-risk:recalculate", limit: 2, windowSeconds: 300 }); const data = await getGlobalRiskCurrent({ force: true }); return jsonSuccess(data, context, { headers: { "Cache-Control": "no-store" }, meta: { modelVersion: data.modelVersion } }); } catch (error) { return jsonFailure(error, context); } }
