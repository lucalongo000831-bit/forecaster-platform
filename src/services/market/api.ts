import "server-only";

import type { RequestContext } from "@/lib/server/request-context";
import { jsonSuccess } from "@/lib/server/api-response";
import type { ProviderResult } from "@/providers/types";
import { ProviderError } from "@/providers/errors";

export function providerApiSuccess<T>(result: ProviderResult<T>, context: RequestContext, cacheControl: string) {
  return jsonSuccess(result.data, context, {
    headers: { "Cache-Control": cacheControl },
    meta: {
      provider: result.meta.provider,
      source: result.meta.provider,
      fetchedAt: result.meta.fetchedAt,
      sourceTimestamp: result.meta.sourceTimestamp,
      freshness: result.meta.freshness,
      quality: result.meta.quality,
      fallback: result.meta.isFallback,
      stale: result.meta.freshness === "stale",
      delayed: result.meta.freshness === "delayed",
    },
  });
}

export function mockApiSuccess<T>(data: T, context: RequestContext, message: string) {
  return jsonSuccess(data, context, {
    headers: { "Cache-Control": "private, no-store" },
    meta: { provider: "mock", source: "mock", fetchedAt: new Date().toISOString(), sourceTimestamp: null, freshness: "fallback", quality: "unavailable", fallback: true, stale: false, delayed: true, message },
  });
}

export function rethrowDefinitiveProviderError(error: unknown) {
  if (error instanceof ProviderError && (error.code === "NOT_FOUND" || error.code === "UNSUPPORTED_SYMBOL" || error.code === "INVALID_RESPONSE")) throw error;
}
