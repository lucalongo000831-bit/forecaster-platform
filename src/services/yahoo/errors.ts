import "server-only";

export type FinancialErrorCode = "INVALID_QUERY" | "INVALID_SYMBOL" | "NOT_FOUND" | "RATE_LIMITED" | "TIMEOUT" | "UPSTREAM";

export class FinancialDataError extends Error {
  constructor(
    public readonly code: FinancialErrorCode,
    message: string,
    public readonly status: number,
    options?: { cause?: unknown },
  ) {
    super(message, options);
    this.name = "FinancialDataError";
  }
}

export function toFinancialDataError(error: unknown): FinancialDataError {
  if (error instanceof FinancialDataError) return error;
  const message = error instanceof Error ? error.message.toLowerCase() : "";
  if (message.includes("abort") || message.includes("timeout")) {
    return new FinancialDataError("TIMEOUT", "Il provider finanziario non ha risposto in tempo.", 504, { cause: error });
  }
  if (message.includes("404") || message.includes("no data") || message.includes("not found")) {
    return new FinancialDataError("NOT_FOUND", "Nessun dato disponibile per questo simbolo.", 404, { cause: error });
  }
  if (message.includes("429") || message.includes("too many")) {
    return new FinancialDataError("RATE_LIMITED", "Il provider è temporaneamente occupato. Riprova tra poco.", 429, { cause: error });
  }
  return new FinancialDataError("UPSTREAM", "I dati di mercato non sono temporaneamente disponibili.", 502, { cause: error });
}

export function canFallback(error: unknown): boolean {
  const normalized = toFinancialDataError(error);
  return normalized.code === "TIMEOUT" || normalized.code === "RATE_LIMITED" || normalized.code === "UPSTREAM";
}

export function safeServerLog(operation: string, symbol: string | undefined, error: unknown) {
  const normalized = toFinancialDataError(error);
  console.warn("[financial-data]", {
    operation,
    symbol,
    code: normalized.code,
  });
}
