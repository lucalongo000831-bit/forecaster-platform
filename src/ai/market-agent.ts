import "server-only";

import { createHash } from "node:crypto";
import type { ResponseInput, ResponseInputItem, ResponseOutputItem } from "openai/resources/responses/responses";
import { structuredLog } from "@/lib/server/logger";
import { getOpenAIClient } from "./client";
import { getKairoConfig } from "./config";
import { pageContextInstruction } from "./context-builder";
import { addKairoToolCall, updateConversationContext } from "./memory";
import { requiredToolForMessage } from "./intent-policy";
import { KAIRO_ANALYST_PROMPT_V1, KAIRO_ANALYST_PROMPT_VERSION } from "./system-prompt";
import { executeKairoTool, kairoTools } from "./tools/registry";
import type { KairoPageContext, KairoSource, KairoStreamEvent } from "./types";

interface AgentInput {
  userId: string;
  conversationId: string;
  history: Array<{ role: string; content: string }>;
  context: KairoPageContext;
  signal: AbortSignal;
  emit: (event: KairoStreamEvent) => void;
}

export interface AgentResult {
  text: string;
  sources: KairoSource[];
  toolCalls: number;
  responseId?: string;
}

function uniqueSources(sources: KairoSource[]): KairoSource[] {
  const seen = new Set<string>();
  return sources.filter((item) => {
    const key = `${item.provider}|${item.url ?? ""}|${item.timestamp ?? ""}|${item.symbol ?? ""}|${item.kind}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  }).slice(0, 40);
}

function safeToolOutput(value: unknown): string {
  const serialized = JSON.stringify(value);
  if (serialized.length <= 40_000) return serialized;
  return JSON.stringify({ data: serialized.slice(0, 39_000), truncated: true, note: "Risultato ridotto per il limite di contesto." });
}

function safetyIdentifier(userId: string): string {
  return createHash("sha256").update(userId).digest("hex").slice(0, 64);
}

export async function runKairoAgent(input: AgentInput): Promise<AgentResult> {
  const config = getKairoConfig();
  const client = getOpenAIClient();
  const sources: KairoSource[] = [];
  let toolCalls = 0;
  let activeContext = { ...input.context };
  const latestUserMessage = [...input.history].reverse().find((message) => message.role === "user")?.content ?? "";
  const requiredFirstTool = requiredToolForMessage(latestUserMessage, activeContext);
  let responseItems: ResponseInput = input.history.map((message) => ({
    role: message.role === "assistant" ? "assistant" : "user",
    content: message.content,
  })) as ResponseInput;

  const requestBase = {
    model: config.model,
    instructions: `${KAIRO_ANALYST_PROMPT_V1}\n\n${pageContextInstruction(input.context)}\nData corrente ISO: ${new Date().toISOString()}.`,
    tools: kairoTools,
    tool_choice: "auto" as const,
    parallel_tool_calls: true,
    max_output_tokens: config.maxOutputTokens,
    reasoning: { effort: "low" as const },
    store: false,
    safety_identifier: safetyIdentifier(input.userId),
    prompt_cache_key: `kairo:${KAIRO_ANALYST_PROMPT_VERSION}`,
  };

  input.emit({ type: "status", message: "Analyzing market data..." });
  while (toolCalls < config.maxToolCallsPerTurn) {
    const response = await client.responses.create({ ...requestBase, input: responseItems, stream: false, tool_choice: toolCalls === 0 && requiredFirstTool ? { type: "function", name: requiredFirstTool } : "auto" }, { signal: input.signal });
    const calls = response.output.filter((item) => item.type === "function_call");
    if (!calls.length) {
      const directText = response.output_text.trim();
      if (directText) {
        input.emit({ type: "delta", text: directText });
        return { text: directText, sources: uniqueSources(sources), toolCalls, responseId: response.id };
      }
      break;
    }

    const remaining = config.maxToolCallsPerTurn - toolCalls;
    const selectedCalls = calls.slice(0, remaining);
    const toolOutputs: ResponseInputItem[] = [];
    for (const call of selectedCalls) {
      toolCalls += 1;
      input.emit({ type: "tool", name: call.name, status: "running" });
      const startedAt = Date.now();
      try {
        const parsedArguments = JSON.parse(call.arguments) as unknown;
        const result = await executeKairoTool(call.name, parsedArguments, activeContext, input.userId);
        if (result.resolvedContext) {
          activeContext = { ...activeContext, ...result.resolvedContext };
          await updateConversationContext(input.conversationId, activeContext);
        }
        sources.push(...result.sources);
        toolOutputs.push({ type: "function_call_output", call_id: call.call_id, output: safeToolOutput({ data: result.data, sources: result.sources }) });
        await addKairoToolCall(input.conversationId, call.name, "complete", { durationMs: Date.now() - startedAt, providers: [...new Set(result.sources.map((item) => item.provider))] });
        input.emit({ type: "tool", name: call.name, status: "complete" });
      } catch (error) {
        const message = error instanceof Error ? error.message : "Dati non disponibili";
        toolOutputs.push({ type: "function_call_output", call_id: call.call_id, output: JSON.stringify({ available: false, error: message }) });
        await addKairoToolCall(input.conversationId, call.name, "failed", { durationMs: Date.now() - startedAt, errorType: error instanceof Error ? error.name : "UnknownError" }).catch(() => undefined);
        input.emit({ type: "tool", name: call.name, status: "failed" });
        structuredLog("warn", "kairo.tool.failed", { tool: call.name, errorType: error instanceof Error ? error.name : "UnknownError" });
      }
    }
    responseItems = [...responseItems, ...(response.output as ResponseOutputItem[]), ...toolOutputs] as unknown as ResponseInput;
    input.emit({ type: "status", message: toolCalls >= config.maxToolCallsPerTurn ? "Generating Kairo analysis..." : "Building scenarios..." });
  }

  input.emit({ type: "status", message: "Generating Kairo analysis..." });
  const stream = await client.responses.create({ ...requestBase, input: responseItems, stream: true, tool_choice: "none" }, { signal: input.signal });
  let text = "";
  let responseId: string | undefined;
  for await (const event of stream) {
    if (event.type === "response.output_text.delta") {
      text += event.delta;
      input.emit({ type: "delta", text: event.delta });
    } else if (event.type === "response.completed") {
      responseId = event.response.id;
    } else if (event.type === "response.failed") {
      throw new Error(event.response.error?.message ?? "Generazione OpenAI non riuscita");
    }
  }
  return { text: text.trim(), sources: uniqueSources(sources), toolCalls, responseId };
}
