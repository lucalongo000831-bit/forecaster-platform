import { listKairoConversations } from "@/ai/memory";
import { assertKairoAiEnabled } from "@/ai/config";
import { jsonFailure, jsonSuccess } from "@/lib/server/api-response";
import { requireUser } from "@/lib/server/auth";
import { createRequestContext } from "@/lib/server/request-context";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const context = createRequestContext(request);
  try {
    assertKairoAiEnabled();
    const user = await requireUser();
    return jsonSuccess(await listKairoConversations(user.id), context, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return jsonFailure(error, context);
  }
}
