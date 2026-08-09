import { assertSameOrigin, createRequestContext, enforceRateLimit, jsonFailure, jsonSuccess, parseJsonBody } from "@/lib/server";
import { requireUser } from "@/lib/server/auth";
import { editorialBriefProvider, globalMarketBriefInputSchema } from "@/services/editorial";
export const runtime = "nodejs"; export const dynamic = "force-dynamic";
export async function POST(request: Request) { const context = createRequestContext(request); try { assertSameOrigin(request); const user = await requireUser(); await enforceRateLimit(`${context.ip}:${user.id}`, { scope: "global-brief:publish", limit: 10, windowSeconds: 300 }); const input = globalMarketBriefInputSchema.parse(await parseJsonBody(request, 140 * 1024)); return jsonSuccess(await editorialBriefProvider.publish(input, user.id), context, { status: 201, headers: { "Cache-Control": "no-store" } }); } catch (error) { return jsonFailure(error, context); } }
