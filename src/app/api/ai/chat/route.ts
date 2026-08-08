import { NextResponse } from "next/server";
import { addKairoMessage, conversationHistory, getOrCreateConversation } from "@/ai/memory";
import { getKairoConfig } from "@/ai/config";
import { normalizePageContext } from "@/ai/context-builder";
import { runKairoAgent } from "@/ai/market-agent";
import { kairoChatRequestSchema } from "@/ai/schemas/chat";
import { KAIRO_ANALYST_PROMPT_VERSION } from "@/ai/system-prompt";
import type { KairoStreamEvent } from "@/ai/types";
import type { KairoAssetType } from "@/ai/types";
import { jsonFailure } from "@/lib/server/api-response";
import { requireUser } from "@/lib/server/auth";
import { enforceRateLimit } from "@/lib/server/rate-limit";
import { createRequestContext } from "@/lib/server/request-context";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const requestContext = createRequestContext(request);
  try {
    const user = await requireUser();
    const config = getKairoConfig();
    await enforceRateLimit(`${user.id}:${requestContext.ip}`, { scope: "ai-chat", limit: config.requestsPerMinute, windowSeconds: 60 });
    const payload = kairoChatRequestSchema.parse(await request.json());
    const pageContext = normalizePageContext(payload);
    const conversation = await getOrCreateConversation(user.id, payload.conversationId, payload.message, pageContext);
    const storedAssetType = conversation.assetType && ["equity", "etf", "fund", "index", "crypto", "forex", "commodity", "unknown"].includes(conversation.assetType) ? conversation.assetType as KairoAssetType : undefined;
    const effectiveContext = normalizePageContext({ symbol: pageContext.symbol ?? conversation.symbol ?? undefined, market: pageContext.market ?? conversation.market ?? undefined, assetType: pageContext.assetType ?? storedAssetType, currentPage: pageContext.currentPage });
    await addKairoMessage(conversation.id, "user", payload.message);
    const history = await conversationHistory(conversation.id);

    const encoder = new TextEncoder();
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        const emit = (event: KairoStreamEvent) => controller.enqueue(encoder.encode(`${JSON.stringify(event)}\n`));
        const abortController = new AbortController();
        const timeout = setTimeout(() => abortController.abort(new Error("Kairo timeout")), config.requestTimeoutMs);
        const onAbort = () => abortController.abort(request.signal.reason);
        request.signal.addEventListener("abort", onAbort, { once: true });

        void (async () => {
          try {
            emit({ type: "conversation", conversationId: conversation.id });
            const result = await runKairoAgent({ userId: user.id, conversationId: conversation.id, history, context: effectiveContext, signal: abortController.signal, emit });
            if (!result.text) throw new Error("La risposta generata è vuota");
            await addKairoMessage(conversation.id, "assistant", result.text, result.sources, { model: config.model, promptVersion: KAIRO_ANALYST_PROMPT_VERSION, toolCalls: result.toolCalls });
            emit({ type: "sources", sources: result.sources });
            emit({ type: "metadata", model: config.model, promptVersion: KAIRO_ANALYST_PROMPT_VERSION, toolCalls: result.toolCalls, responseId: result.responseId });
            emit({ type: "done" });
          } catch {
            const aborted = abortController.signal.aborted;
            emit({ type: "error", message: aborted ? "Generazione interrotta o scaduta. Riprova." : "Ask Kairo non è temporaneamente disponibile. Riprova.", retryable: true });
          } finally {
            clearTimeout(timeout);
            request.signal.removeEventListener("abort", onAbort);
            controller.close();
          }
        })();
      },
    });

    return new NextResponse(stream, {
      headers: {
        "Content-Type": "application/x-ndjson; charset=utf-8",
        "Cache-Control": "no-store, no-transform",
        "X-Accel-Buffering": "no",
        "X-Request-Id": requestContext.requestId,
      },
    });
  } catch (error) {
    return jsonFailure(error, requestContext);
  }
}
