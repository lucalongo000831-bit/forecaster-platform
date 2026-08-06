import "server-only";

import { z } from "zod";
import { getServerEnvironment } from "@/schemas/env";
import { enforceRateLimit } from "@/lib/server/rate-limit";
import { ProviderError } from "../errors";
import { providerRequest } from "../http";

const recordSchema = z.record(z.string(), z.unknown());
export const fmpArraySchema = z.array(recordSchema);

function errorMessage(value: unknown): string | null {
  if (!value || typeof value !== "object") return null;
  const record = value as Record<string, unknown>;
  for (const key of ["Error Message", "error", "message"]) {
    if (typeof record[key] === "string" && record[key]) return record[key];
  }
  return null;
}

export async function fmpGet(path: string, params: Record<string, string | number | undefined>, operation: string) {
  const env = getServerEnvironment();
  if (!env.FMP_API_KEY) throw new ProviderError("fmp", "NOT_CONFIGURED", "FMP non configurato.", false, 503);
  await enforceRateLimit("global", { scope: "provider:fmp", limit: 240, windowSeconds: 60 });
  const url = new URL(`/stable/${path.replace(/^\/+/, "")}`, env.FMP_BASE_URL);
  for (const [key, value] of Object.entries(params)) if (value !== undefined) url.searchParams.set(key, String(value));
  const data = await providerRequest({
    provider: "fmp",
    operation,
    url,
    schema: z.union([fmpArraySchema, recordSchema]),
    headers: { apikey: env.FMP_API_KEY },
    timeoutMs: 14_000,
    retries: 1,
  });
  const message = errorMessage(data);
  if (message) {
    const restricted = /plan|subscription|premium|upgrade|not available/i.test(message);
    const unauthorized = /api.?key|unauthor|forbidden/i.test(message);
    throw new ProviderError(
      "fmp",
      restricted ? "PLAN_RESTRICTED" : unauthorized ? "UNAUTHORIZED" : "UPSTREAM_UNAVAILABLE",
      restricted ? "Endpoint FMP non incluso nel piano configurato." : "FMP non ha restituito dati utilizzabili.",
      !restricted && !unauthorized,
      502,
    );
  }
  return Array.isArray(data) ? data : [data];
}

export function stringValue(record: Record<string, unknown>, ...keys: string[]): string | null {
  for (const key of keys) if (typeof record[key] === "string" && record[key]) return record[key] as string;
  return null;
}

export function numberValue(record: Record<string, unknown>, ...keys: string[]): number | null {
  for (const key of keys) {
    const value = record[key];
    const parsed = typeof value === "number" ? value : typeof value === "string" && value.trim() ? Number(value) : Number.NaN;
    if (Number.isFinite(parsed)) return parsed;
  }
  return null;
}

export function booleanValue(record: Record<string, unknown>, key: string): boolean | null {
  return typeof record[key] === "boolean" ? record[key] as boolean : null;
}
