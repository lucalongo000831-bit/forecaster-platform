import "server-only";

import { ProviderError } from "./errors";
import type { ProviderName } from "./types";

interface ProviderPolicy {
  requestsPerSecond: number;
  maxConcurrent: number;
  circuitFailures: number;
  circuitCooldownMs: number;
}

interface ProviderRuntime {
  timestamps: number[];
  active: number;
  consecutiveFailures: number;
  circuitOpenUntil: number;
  lastRateLimit: string | null;
}

const DEFAULT_POLICY: ProviderPolicy = { requestsPerSecond: 4, maxConcurrent: 4, circuitFailures: 4, circuitCooldownMs: 60_000 };
const policies: Partial<Record<ProviderName, ProviderPolicy>> = {
  "sec-edgar": { requestsPerSecond: 8, maxConcurrent: 2, circuitFailures: 4, circuitCooldownMs: 60_000 },
  fmp: { requestsPerSecond: 4, maxConcurrent: 3, circuitFailures: 3, circuitCooldownMs: 120_000 },
  "alpha-vantage": { requestsPerSecond: 1, maxConcurrent: 1, circuitFailures: 2, circuitCooldownMs: 90_000 },
  finnhub: { requestsPerSecond: 1, maxConcurrent: 2, circuitFailures: 3, circuitCooldownMs: 60_000 },
  coingecko: { requestsPerSecond: 2, maxConcurrent: 2, circuitFailures: 3, circuitCooldownMs: 60_000 },
  eodhd: { requestsPerSecond: 3, maxConcurrent: 3, circuitFailures: 3, circuitCooldownMs: 90_000 },
};

const runtimes = new Map<ProviderName, ProviderRuntime>();

function runtime(provider: ProviderName) {
  const current = runtimes.get(provider) ?? { timestamps: [], active: 0, consecutiveFailures: 0, circuitOpenUntil: 0, lastRateLimit: null };
  runtimes.set(provider, current);
  return current;
}

async function wait(milliseconds: number) {
  await new Promise((resolve) => setTimeout(resolve, milliseconds));
}

async function acquire(provider: ProviderName) {
  const policy = policies[provider] ?? DEFAULT_POLICY;
  const state = runtime(provider);
  if (state.circuitOpenUntil > Date.now()) {
    throw new ProviderError(provider, "UPSTREAM_UNAVAILABLE", "Circuito provider temporaneamente aperto.", true, 503);
  }
  for (let attempt = 0; attempt < 40; attempt += 1) {
    const now = Date.now();
    state.timestamps = state.timestamps.filter((timestamp) => now - timestamp < 1_000);
    if (state.active < policy.maxConcurrent && state.timestamps.length < policy.requestsPerSecond) {
      state.active += 1;
      state.timestamps.push(now);
      return;
    }
    await wait(25);
  }
  state.lastRateLimit = new Date().toISOString();
  throw new ProviderError(provider, "RATE_LIMITED", "Budget interno del provider temporaneamente esaurito.", true, 429);
}

function release(provider: ProviderName, succeeded: boolean, rateLimited: boolean, countFailure = true) {
  const policy = policies[provider] ?? DEFAULT_POLICY;
  const state = runtime(provider);
  state.active = Math.max(0, state.active - 1);
  if (succeeded) {
    state.consecutiveFailures = 0;
    state.circuitOpenUntil = 0;
    return;
  }
  if (rateLimited) state.lastRateLimit = new Date().toISOString();
  if (!countFailure) return;
  state.consecutiveFailures += 1;
  if (state.consecutiveFailures >= policy.circuitFailures) state.circuitOpenUntil = Date.now() + policy.circuitCooldownMs;
}

export async function coordinatedProviderRequest<T>(provider: ProviderName, task: () => Promise<T>): Promise<T> {
  await acquire(provider);
  try {
    const result = await task();
    release(provider, true, false);
    return result;
  } catch (error) {
    const providerError = error instanceof ProviderError ? error : null;
    release(provider, false, providerError?.code === "RATE_LIMITED", !providerError || providerError.retryable || providerError.code === "RATE_LIMITED" || providerError.code === "UNAUTHORIZED");
    throw error;
  }
}

export function getProviderCoordinatorState(provider: ProviderName) {
  const state = runtime(provider);
  return {
    activeRequests: state.active,
    recentRequests: state.timestamps.filter((timestamp) => Date.now() - timestamp < 1_000).length,
    consecutiveFailures: state.consecutiveFailures,
    circuitOpen: state.circuitOpenUntil > Date.now(),
    circuitOpenUntil: state.circuitOpenUntil ? new Date(state.circuitOpenUntil).toISOString() : null,
    lastRateLimit: state.lastRateLimit,
  };
}
