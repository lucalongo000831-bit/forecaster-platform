import "server-only";

import { NextResponse } from "next/server";
import type { RequestContext } from "./request-context";
import { toAppError } from "./app-error";
import { structuredLog } from "./logger";

export function jsonSuccess<T>(data: T, context: RequestContext, init?: { status?: number; headers?: HeadersInit; meta?: Record<string, unknown> }) {
  return NextResponse.json({ data, meta: { requestId: context.requestId, ...init?.meta } }, {
    status: init?.status ?? 200,
    headers: { "X-Request-Id": context.requestId, ...init?.headers },
  });
}

export function jsonFailure(error: unknown, context: RequestContext) {
  const normalized = toAppError(error);
  structuredLog(normalized.status >= 500 ? "error" : "warn", "api_request_failed", {
    requestId: context.requestId,
    code: normalized.code,
    durationMs: Date.now() - context.startedAt,
    status: normalized.status,
  });
  const headers: Record<string, string> = { "Cache-Control": "no-store", "X-Request-Id": context.requestId };
  if (normalized.retryAfterSeconds) headers["Retry-After"] = String(normalized.retryAfterSeconds);
  return NextResponse.json({ error: { code: normalized.code, message: normalized.message, requestId: context.requestId, retryable: normalized.retryable } }, { status: normalized.status, headers });
}
