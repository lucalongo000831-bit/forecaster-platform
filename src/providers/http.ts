import "server-only";

import type { ZodType } from "zod";
import { structuredLog } from "@/lib/server/logger";
import { ProviderError, normalizeProviderError } from "./errors";
import { recordProviderFailure, recordProviderSuccess } from "./health";
import type { ProviderName } from "./types";
import { coordinatedProviderRequest } from "./coordinator";

interface ProviderRequest<T> {
  provider: ProviderName;
  operation: string;
  url: URL;
  schema: ZodType<T>;
  headers?: HeadersInit;
  timeoutMs?: number;
  retries?: number;
}

function retryDelay(attempt: number) {
  return 250 * 2 ** attempt + Math.floor(Math.random() * 150);
}

function retryableStatus(status: number) {
  return status === 408 || status === 429 || status >= 500;
}

export async function providerRequest<T>(request: ProviderRequest<T>): Promise<T> {
  const attempts = Math.max(1, Math.min(3, (request.retries ?? 1) + 1));
  let lastError: unknown;

  for (let attempt = 0; attempt < attempts; attempt += 1) {
    const startedAt = Date.now();
    try {
      const response = await coordinatedProviderRequest(request.provider, async () => {
        const upstream = await fetch(request.url, { headers: request.headers, cache: "no-store", redirect: "error", signal: AbortSignal.timeout(request.timeoutMs ?? 12_000) });
        if (!upstream.ok) {
          const code = upstream.status === 401 || upstream.status === 403 ? "UNAUTHORIZED" : upstream.status === 404 ? "NOT_FOUND" : upstream.status === 429 ? "RATE_LIMITED" : "UPSTREAM_UNAVAILABLE";
          throw new ProviderError(request.provider, code, `Risposta provider HTTP ${upstream.status}.`, retryableStatus(upstream.status), upstream.status === 404 ? 404 : 502);
        }
        return upstream;
      });
      const raw: unknown = await response.json();
      const parsed = request.schema.safeParse(raw);
      if (!parsed.success) {
        throw new ProviderError(request.provider, "INVALID_RESPONSE", "Risposta provider non conforme al contratto.", false, 502);
      }
      structuredLog("info", "provider.request.completed", {
        provider: request.provider,
        operation: request.operation,
        durationMs: Date.now() - startedAt,
        status: response.status,
      });
      recordProviderSuccess(request.provider, Date.now() - startedAt);
      return parsed.data;
    } catch (error) {
      lastError = normalizeProviderError(request.provider, error);
      structuredLog("warn", "provider.request.failed", {
        provider: request.provider,
        operation: request.operation,
        durationMs: Date.now() - startedAt,
        code: lastError instanceof ProviderError ? lastError.code : "UNKNOWN",
      });
      recordProviderFailure(request.provider, lastError instanceof ProviderError ? lastError.code : "UNKNOWN", Date.now() - startedAt);
      if (!(lastError instanceof ProviderError) || !lastError.retryable || attempt === attempts - 1) break;
      await new Promise((resolve) => setTimeout(resolve, retryDelay(attempt)));
    }
  }

  throw normalizeProviderError(request.provider, lastError);
}
