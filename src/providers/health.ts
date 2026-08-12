import "server-only";

import type { ProviderName } from "./types";

export interface ProviderHealthSnapshot {
  provider: ProviderName;
  healthy: boolean | null;
  lastSuccess: string | null;
  lastError: string | null;
  latencyMs: number | null;
  lastDataTimestamp: string | null;
  rateLimited: boolean;
}

const providers: ProviderName[] = ["massive", "fmp", "alpha-vantage", "eodhd", "finnhub", "coingecko", "sec-edgar", "esef", "yahoo", "bargo", "capitol-exposed"];
const state = new Map<ProviderName, ProviderHealthSnapshot>(
  providers.map((provider) => [provider, { provider, healthy: null, lastSuccess: null, lastError: null, latencyMs: null, lastDataTimestamp: null, rateLimited: false }]),
);

export function recordProviderSuccess(provider: ProviderName, latencyMs: number, lastDataTimestamp?: string | null) {
  const previous = state.get(provider);
  state.set(provider, {
    provider,
    healthy: true,
    lastSuccess: new Date().toISOString(),
    lastError: previous?.lastError ?? null,
    latencyMs,
    lastDataTimestamp: lastDataTimestamp ?? previous?.lastDataTimestamp ?? null,
    rateLimited: false,
  });
}

export function recordProviderFailure(provider: ProviderName, errorCode: string, latencyMs: number) {
  const previous = state.get(provider);
  state.set(provider, {
    provider,
    healthy: false,
    lastSuccess: previous?.lastSuccess ?? null,
    lastError: `${new Date().toISOString()} · ${errorCode}`,
    latencyMs,
    lastDataTimestamp: previous?.lastDataTimestamp ?? null,
    rateLimited: errorCode === "RATE_LIMITED",
  });
}

export function recordProviderDataTimestamp(provider: ProviderName, timestamp: string | null) {
  if (!timestamp) return;
  const previous = state.get(provider);
  if (previous) state.set(provider, { ...previous, lastDataTimestamp: timestamp });
}

export function getProviderHealth() {
  return providers.map((provider) => state.get(provider)!);
}
