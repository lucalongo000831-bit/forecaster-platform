import "server-only";

import { AppError } from "@/lib/server/app-error";
import { getServerEnvironment } from "@/schemas/env";

export const KAIRO_LIMITS = {
  maxMessageCharacters: 4_000,
  maxConversationMessages: 12,
  maxToolCallsPerTurn: 8,
  maxOutputTokens: 2_400,
  requestTimeoutMs: 55_000,
  requestsPerMinute: 10,
} as const;

export function assertKairoAiEnabled() {
  if (!getServerEnvironment().ENABLE_KAIRO_AI) {
    throw new AppError("NOT_CONFIGURED", "Kairo AI sarà disponibile prossimamente", 503);
  }
}

export function getKairoConfig() {
  const environment = getServerEnvironment();
  assertKairoAiEnabled();
  if (!environment.OPENAI_API_KEY) {
    throw new AppError("NOT_CONFIGURED", "Ask Kairo non è ancora configurato", 503);
  }
  if (!environment.OPENAI_MODEL) {
    throw new AppError("NOT_CONFIGURED", "OPENAI_MODEL non è configurato", 503);
  }
  return {
    apiKey: environment.OPENAI_API_KEY,
    model: environment.OPENAI_MODEL,
    ...KAIRO_LIMITS,
  };
}
