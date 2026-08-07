import { z } from "zod";
import { loadKairoConversation } from "@/ai/memory";
import { jsonFailure, jsonSuccess } from "@/lib/server/api-response";
import { requireUser } from "@/lib/server/auth";
import { createRequestContext } from "@/lib/server/request-context";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const context = createRequestContext(request);
  try {
    const user = await requireUser();
    const { id } = await params;
    return jsonSuccess(await loadKairoConversation(user.id, z.uuid().parse(id)), context, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return jsonFailure(error, context);
  }
}
