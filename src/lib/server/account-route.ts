import "server-only";

import { isDatabaseConfigured } from "@/db";
import { AppError } from "./app-error";
import { requireUser } from "./auth";
import { assertSameOrigin } from "./csrf";
import { enforceRateLimit } from "./rate-limit";
import type { RequestContext } from "./request-context";

export function assertBodySize(request: Request, maximum = 16_384) {
  if (Number(request.headers.get("content-length") ?? 0) > maximum) throw new AppError("BAD_REQUEST", "Richiesta troppo grande", 413);
}

export async function parseJsonBody(request: Request, maximum = 16_384): Promise<unknown> {
  assertBodySize(request, maximum);
  if (!request.headers.get("content-type")?.toLowerCase().startsWith("application/json")) throw new AppError("BAD_REQUEST", "Content-Type non supportato", 415);
  const body = await request.text();
  if (new TextEncoder().encode(body).byteLength > maximum) throw new AppError("BAD_REQUEST", "Richiesta troppo grande", 413);
  try { return JSON.parse(body) as unknown; } catch { throw new AppError("BAD_REQUEST", "Corpo JSON non valido", 400); }
}

export async function requireAccount(request: Request, context: RequestContext, write = false) {
  if (!isDatabaseConfigured()) throw new AppError("NOT_CONFIGURED", "Database account non configurato", 503);
  if (write) { assertSameOrigin(request); assertBodySize(request); }
  const user = await requireUser();
  await enforceRateLimit(`${context.ip}:${user.id}`, { scope: write ? "account:write" : "account:read", limit: write ? 30 : 120, windowSeconds: 60 });
  return user;
}
