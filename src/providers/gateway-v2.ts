import "server-only";

import { sql } from "drizzle-orm";
import type { ZodType } from "zod";
import { getDatabase, isDatabaseConfigured, providerQuotaStates, providerRuns } from "@/db";
import { cacheGet, cacheSet } from "@/lib/server/redis";
import type { ProviderRequestPriority } from "@/types";
import { redactProviderRequest, type ProviderRequestLogInput } from "./security/redaction";

export type GatewayErrorClass = "AUTH_ERROR" | "RATE_LIMIT" | "TIMEOUT" | "UPSTREAM_4XX" | "UPSTREAM_5XX" | "SCHEMA_ERROR" | "EMPTY_RESPONSE" | "DATA_CONFLICT" | "UNKNOWN";
export type GatewayCircuitState = "HEALTHY" | "DEGRADED" | "RATE_LIMITED" | "OFFLINE" | "DISABLED" | "UNKNOWN";

export class ProviderGatewayError extends Error {
  constructor(public readonly errorClass: GatewayErrorClass, message: string, public readonly retryable: boolean, public readonly httpStatus: number | null = null, options?: { cause?: unknown }) {
    super(message, options);
    this.name = "ProviderGatewayError";
  }
}

export interface GatewayCachePolicy { freshSeconds: number; staleSeconds: number; }
export interface GatewayExecuteInput<T> {
  provider: string;
  dataset: string;
  operation: string;
  priority?: ProviderRequestPriority;
  requestKey: string;
  schema: ZodType<T>;
  task: () => Promise<unknown>;
  cache?: GatewayCachePolicy;
  retryCount?: number;
  requestMetadata?: ProviderRequestLogInput;
  fallback?: () => Promise<T | null>;
}

export interface GatewayResult<T> {
  data: T;
  provider: string;
  status: "AVAILABLE" | "CACHED" | "STALE";
  isFallback: boolean;
  fetchedAt: string;
}

interface CircuitRuntime { failures: number; openUntil: number; state: GatewayCircuitState; }
interface CachedGatewayResult<T> { result: GatewayResult<T>; freshUntil: number; }

const pending = new Map<string, Promise<GatewayResult<unknown>>>();
const circuits = new Map<string, CircuitRuntime>();
const telemetryTimeoutMs = 2_000;

async function recordBestEffort(operation: Promise<unknown>) {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    await Promise.race([
      operation,
      new Promise((resolve) => {
        timer = setTimeout(resolve, telemetryTimeoutMs);
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

function circuit(provider: string) {
  const value = circuits.get(provider) ?? { failures: 0, openUntil: 0, state: "UNKNOWN" as GatewayCircuitState };
  circuits.set(provider, value);
  return value;
}

function classify(error: unknown): ProviderGatewayError {
  if (error instanceof ProviderGatewayError) return error;
  const message = error instanceof Error ? error.message.toLowerCase() : "";
  if (message.includes("abort") || message.includes("timeout")) return new ProviderGatewayError("TIMEOUT", "Provider timeout", true, 504, { cause: error });
  if (message.includes("429") || message.includes("rate limit")) return new ProviderGatewayError("RATE_LIMIT", "Provider rate limited", true, 429, { cause: error });
  if (message.includes("401") || message.includes("403") || message.includes("unauthor")) return new ProviderGatewayError("AUTH_ERROR", "Provider authentication failed", false, 401, { cause: error });
  if (/\b5\d\d\b/.test(message)) return new ProviderGatewayError("UPSTREAM_5XX", "Provider server error", true, 502, { cause: error });
  if (/\b4\d\d\b/.test(message)) return new ProviderGatewayError("UPSTREAM_4XX", "Provider request rejected", false, 400, { cause: error });
  return new ProviderGatewayError("UNKNOWN", "Provider request failed", true, null, { cause: error });
}

function retryDelay(attempt: number) { return 200 * 2 ** attempt + Math.floor(Math.random() * 100); }

async function recordRun(input: GatewayExecuteInput<unknown>, startedAt: number, status: string, error?: ProviderGatewayError) {
  if (!isDatabaseConfigured()) return;
  await getDatabase().insert(providerRuns).values({ provider: input.provider, dataset: input.dataset, operation: input.operation, priority: input.priority ?? "NORMAL", status, httpStatus: error?.httpStatus, latencyMs: Date.now() - startedAt, errorClass: error?.errorClass, completedAt: new Date(), metadata: input.requestMetadata ? { request: redactProviderRequest(input.requestMetadata) } : {} }).catch(() => undefined);
}

async function recordQuota(provider: string, error?: ProviderGatewayError) {
  if (!isDatabaseConfigured()) return;
  const rateLimited = error?.errorClass === "RATE_LIMIT";
  await getDatabase().insert(providerQuotaStates).values({ provider, minuteCount: 1, hourCount: 1, dayCount: 1, circuitState: rateLimited ? "RATE_LIMITED" : "HEALTHY", lastRateLimitedAt: rateLimited ? new Date() : null, failuresToday: error ? 1 : 0 })
    .onConflictDoUpdate({ target: providerQuotaStates.provider, set: { minuteCount: sql`${providerQuotaStates.minuteCount} + 1`, hourCount: sql`${providerQuotaStates.hourCount} + 1`, dayCount: sql`${providerQuotaStates.dayCount} + 1`, circuitState: rateLimited ? "RATE_LIMITED" : error ? "DEGRADED" : "HEALTHY", lastRateLimitedAt: rateLimited ? new Date() : undefined, failuresToday: error ? sql`${providerQuotaStates.failuresToday} + 1` : providerQuotaStates.failuresToday, updatedAt: new Date() } }).catch(() => undefined);
}

async function executeUncached<T>(input: GatewayExecuteInput<T>): Promise<GatewayResult<T>> {
  const state = circuit(input.provider);
  if (state.openUntil > Date.now()) {
    const fallback = await input.fallback?.();
    if (fallback !== null && fallback !== undefined) return { data: fallback, provider: input.provider, status: "STALE", isFallback: true, fetchedAt: new Date().toISOString() };
    throw new ProviderGatewayError("UPSTREAM_5XX", "Provider circuit open", true, 503);
  }

  const startedAt = Date.now();
  const attempts = Math.max(1, Math.min(3, (input.retryCount ?? 1) + 1));
  let lastError: ProviderGatewayError | null = null;
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    try {
      const parsed = input.schema.safeParse(await input.task());
      if (!parsed.success) throw new ProviderGatewayError("SCHEMA_ERROR", "Provider schema validation failed", false, null);
      state.failures = 0; state.openUntil = 0; state.state = "HEALTHY";
      const result: GatewayResult<T> = { data: parsed.data, provider: input.provider, status: "AVAILABLE", isFallback: false, fetchedAt: new Date().toISOString() };
      await Promise.all([
        recordBestEffort(recordRun(input as GatewayExecuteInput<unknown>, startedAt, "COMPLETED")),
        recordBestEffort(recordQuota(input.provider)),
      ]);
      return result;
    } catch (error) {
      lastError = classify(error);
      if (!lastError.retryable || attempt === attempts - 1) break;
      await new Promise((resolve) => setTimeout(resolve, retryDelay(attempt)));
    }
  }

  state.failures += 1;
  state.state = lastError?.errorClass === "RATE_LIMIT" ? "RATE_LIMITED" : "DEGRADED";
  if (state.failures >= 3) { state.openUntil = Date.now() + 60_000; state.state = "OFFLINE"; }
  await Promise.all([
    recordBestEffort(recordRun(input as GatewayExecuteInput<unknown>, startedAt, "FAILED", lastError ?? undefined)),
    recordBestEffort(recordQuota(input.provider, lastError ?? undefined)),
  ]);
  const fallback = await input.fallback?.();
  if (fallback !== null && fallback !== undefined) return { data: fallback, provider: input.provider, status: "STALE", isFallback: true, fetchedAt: new Date().toISOString() };
  throw lastError ?? new ProviderGatewayError("UNKNOWN", "Provider request failed", true);
}

export class ProviderGatewayV2 {
  async execute<T>(input: GatewayExecuteInput<T>): Promise<GatewayResult<T>> {
    const cacheKey = `gateway-v2:${input.provider}:${input.dataset}:${input.requestKey}`;
    if (input.cache) {
      const cached = await cacheGet<CachedGatewayResult<T>>(cacheKey);
      if (cached?.freshUntil && cached.freshUntil > Date.now()) return { ...cached.result, status: "CACHED" };
      if (cached) {
        void this.refresh(cacheKey, input);
        return { ...cached.result, status: "STALE", isFallback: true };
      }
    }
    return this.refresh(cacheKey, input);
  }

  private async refresh<T>(cacheKey: string, input: GatewayExecuteInput<T>) {
    const existing = pending.get(cacheKey) as Promise<GatewayResult<T>> | undefined;
    if (existing) return existing;
    const task = executeUncached(input).then(async (result) => {
      if (input.cache) await cacheSet(cacheKey, { result, freshUntil: Date.now() + input.cache.freshSeconds * 1_000 }, input.cache.freshSeconds + input.cache.staleSeconds);
      return result;
    }).finally(() => pending.delete(cacheKey));
    pending.set(cacheKey, task as Promise<GatewayResult<unknown>>);
    return task;
  }

  state(provider: string) { return { ...circuit(provider) }; }
  reset(provider: string) { circuits.delete(provider); }
}

export const providerGatewayV2 = new ProviderGatewayV2();
