import "server-only";

import { z } from "zod";
import { getServerEnvironment } from "@/schemas/env";
import { enforceRateLimit } from "@/lib/server/rate-limit";
import { ProviderError } from "../errors";
import { providerRequest } from "../http";

export const massiveResponseSchema = z.object({
  status: z.string().optional(),
  error: z.string().optional(),
  message: z.string().optional(),
}).passthrough();

export async function massiveGet(path: string, params: Record<string, string | number | boolean | undefined>, operation: string) {
  const env = getServerEnvironment();
  const apiKey = env.MASSIVE_API_KEY ?? env.POLYGON_API_KEY;
  if (!apiKey) throw new ProviderError("massive", "NOT_CONFIGURED", "Massive non configurato.", false, 503);
  await enforceRateLimit("global", { scope: "provider:massive", limit: 120, windowSeconds: 60 });
  const url = new URL(path, env.MASSIVE_BASE_URL);
  for (const [key, value] of Object.entries(params)) if (value !== undefined) url.searchParams.set(key, String(value));
  const data = await providerRequest({ provider: "massive", operation, url, schema: massiveResponseSchema, headers: { Authorization: `Bearer ${apiKey}` }, timeoutMs: 14_000, retries: 1 });
  if (data.error || data.status === "ERROR" || data.status === "NOT_AUTHORIZED") {
    const message = data.error ?? data.message ?? "";
    const restricted = /plan|subscription|not entitled|permission|upgrade|forbidden/i.test(message);
    const rateLimited = /rate|limit|too many/i.test(message);
    throw new ProviderError("massive", restricted ? "PLAN_RESTRICTED" : rateLimited ? "RATE_LIMITED" : "UPSTREAM_UNAVAILABLE", restricted ? "Endpoint Massive non incluso nel piano configurato." : rateLimited ? "Quota Massive temporaneamente esaurita." : "Massive non ha restituito dati utilizzabili.", rateLimited, rateLimited ? 429 : 502);
  }
  return data as Record<string, unknown>;
}

export function recordValue(record: Record<string, unknown>, key: string): Record<string, unknown> {
  const value = record[key];
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

export function massiveNumber(record: Record<string, unknown>, ...keys: string[]): number | null {
  for (const key of keys) {
    const value = record[key];
    if (typeof value === "number" && Number.isFinite(value)) return value;
  }
  return null;
}

export function massiveString(record: Record<string, unknown>, ...keys: string[]): string | null {
  for (const key of keys) if (typeof record[key] === "string" && record[key]) return record[key] as string;
  return null;
}
