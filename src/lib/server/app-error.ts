import "server-only";

import { ProviderError } from "@/providers/errors";
import { ZodError } from "zod";

export type AppErrorCode =
  | "BAD_REQUEST"
  | "UNAUTHENTICATED"
  | "FORBIDDEN"
  | "NOT_FOUND"
  | "CONFLICT"
  | "RATE_LIMITED"
  | "AUTH_ERROR"
  | "TIMEOUT"
  | "NO_DATA"
  | "STALE_DATA"
  | "INVALID_SYMBOL"
  | "MARKET_CLOSED"
  | "UNSUPPORTED_ASSET"
  | "PROVIDER_ERROR"
  | "NOT_CONFIGURED"
  | "PROVIDER_UNAVAILABLE"
  | "DATABASE_UNAVAILABLE"
  | "INTERNAL_ERROR";

export class AppError extends Error {
  constructor(
    public readonly code: AppErrorCode,
    message: string,
    public readonly status: number,
    public readonly retryable = false,
    public readonly retryAfterSeconds?: number,
    options?: { cause?: unknown },
  ) {
    super(message, options);
    this.name = "AppError";
  }
}

export function toAppError(error: unknown): AppError {
  if (error instanceof AppError) return error;
  if (error instanceof ZodError) return new AppError("BAD_REQUEST", "Parametri della richiesta non validi", 400, false, undefined, { cause: error });
  if (error instanceof ProviderError) {
    if (error.code === "NOT_FOUND") return new AppError("NO_DATA", error.message, 404, false, undefined, { cause: error });
    if (error.code === "NOT_CONFIGURED") return new AppError("NOT_CONFIGURED", "Provider non configurato", 503, false, undefined, { cause: error });
    if (error.code === "RATE_LIMITED") return new AppError("RATE_LIMITED", error.message, 429, true, 60, { cause: error });
    if (error.code === "UNAUTHORIZED") return new AppError("AUTH_ERROR", "Autenticazione del provider non riuscita", 502, false, undefined, { cause: error });
    if (error.code === "TIMEOUT") return new AppError("TIMEOUT", error.message, 504, true, undefined, { cause: error });
    if (error.code === "UNSUPPORTED_SYMBOL") return new AppError("UNSUPPORTED_ASSET", error.message, 400, false, undefined, { cause: error });
    return new AppError("PROVIDER_ERROR", error.message, error.status >= 500 ? error.status : 502, error.retryable, undefined, { cause: error });
  }
  return new AppError("INTERNAL_ERROR", "Errore interno temporaneo", 500, false, undefined, { cause: error });
}
