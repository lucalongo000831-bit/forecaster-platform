import "server-only";

import type { ProviderName } from "./types";

export type ProviderErrorCode =
  | "NOT_CONFIGURED"
  | "UNSUPPORTED_SYMBOL"
  | "NOT_FOUND"
  | "UNAUTHORIZED"
  | "PLAN_RESTRICTED"
  | "RATE_LIMITED"
  | "TIMEOUT"
  | "INVALID_RESPONSE"
  | "UPSTREAM_UNAVAILABLE";

export class ProviderError extends Error {
  constructor(
    public readonly provider: ProviderName,
    public readonly code: ProviderErrorCode,
    message: string,
    public readonly retryable: boolean,
    public readonly status: number,
    options?: { cause?: unknown },
  ) {
    super(message, options);
    this.name = "ProviderError";
  }
}

export function normalizeProviderError(provider: ProviderName, error: unknown): ProviderError {
  if (error instanceof ProviderError) return error;
  const message = error instanceof Error ? error.message.toLowerCase() : "";
  if (message.includes("abort") || message.includes("timeout")) {
    return new ProviderError(provider, "TIMEOUT", "Il provider non ha risposto entro il timeout.", true, 504, { cause: error });
  }
  if (message.includes("429") || message.includes("rate limit") || message.includes("too many")) {
    return new ProviderError(provider, "RATE_LIMITED", "Quota temporaneamente esaurita per il provider.", true, 429, { cause: error });
  }
  if (message.includes("401") || message.includes("403") || message.includes("unauthor")) {
    return new ProviderError(provider, "UNAUTHORIZED", "Credenziale provider non autorizzata.", false, 502, { cause: error });
  }
  if (message.includes("404") || message.includes("not found") || message.includes("no data")) {
    return new ProviderError(provider, "NOT_FOUND", "Dato non disponibile presso il provider.", false, 404, { cause: error });
  }
  return new ProviderError(provider, "UPSTREAM_UNAVAILABLE", "Provider finanziario temporaneamente non disponibile.", true, 502, { cause: error });
}

export function isRecoverableProviderError(error: unknown): boolean {
  return error instanceof ProviderError
    ? error.retryable || error.code === "NOT_CONFIGURED" || error.code === "PLAN_RESTRICTED" || error.code === "UNSUPPORTED_SYMBOL"
    : true;
}
