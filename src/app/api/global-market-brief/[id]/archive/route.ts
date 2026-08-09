import { z } from "zod";
import { assertSameOrigin, createRequestContext, enforceRateLimit, jsonFailure, jsonSuccess } from "@/lib/server";
import { requireUser } from "@/lib/server/auth";
import { editorialBriefProvider } from "@/services/editorial";
export const runtime = "nodejs"; export const dynamic = "force-dynamic";
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) { const context = createRequestContext(request); try { assertSameOrigin(request); const user = await requireUser(); await enforceRateLimit(`${context.ip}:${user.id}`, { scope: "global-brief:archive", limit: 10, windowSeconds: 300 }); const id = z.uuid().parse((await params).id); await editorialBriefProvider.archive(id, user.id); return jsonSuccess({ archived: true }, context, { headers: { "Cache-Control": "no-store" } }); } catch (error) { return jsonFailure(error, context); } }
