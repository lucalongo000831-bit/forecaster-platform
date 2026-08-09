import { z } from "zod";
import { assertSameOrigin, createRequestContext, enforceRateLimit, jsonFailure, jsonSuccess, parseJsonBody } from "@/lib/server";
import { requireUser } from "@/lib/server/auth";
import { parseGlobalMarketBrief } from "@/services/editorial";
export const runtime = "nodejs"; export const dynamic = "force-dynamic";
export async function POST(request: Request) { const context = createRequestContext(request); try { assertSameOrigin(request); const user = await requireUser(); await enforceRateLimit(`${context.ip}:${user.id}`, { scope: "global-brief:parse", limit: 20 }); const body = z.object({ rawText: z.string() }).parse(await parseJsonBody(request, 110 * 1024)); return jsonSuccess(parseGlobalMarketBrief(body.rawText), context, { headers: { "Cache-Control": "no-store" } }); } catch (error) { return jsonFailure(error, context); } }
