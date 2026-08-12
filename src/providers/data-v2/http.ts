import "server-only";

import { ProviderGatewayError } from "@/providers/gateway-v2";

export async function officialJson(url: URL, init: RequestInit = {}, timeoutMs = 12_000): Promise<unknown> {
  const response = await fetch(url, { ...init, cache: "no-store", redirect: "error", signal: AbortSignal.timeout(timeoutMs) });
  if (!response.ok) {
    const errorClass = response.status === 429 ? "RATE_LIMIT" : response.status === 401 || response.status === 403 ? "AUTH_ERROR" : response.status >= 500 ? "UPSTREAM_5XX" : "UPSTREAM_4XX";
    throw new ProviderGatewayError(errorClass, `Official source returned HTTP ${response.status}`, response.status === 408 || response.status === 429 || response.status >= 500, response.status);
  }
  return response.json();
}

export async function officialText(url: URL, init: RequestInit = {}, timeoutMs = 12_000): Promise<string> {
  const response = await fetch(url, { ...init, cache: "no-store", redirect: "error", signal: AbortSignal.timeout(timeoutMs) });
  if (!response.ok) {
    const errorClass = response.status === 429 ? "RATE_LIMIT" : response.status === 401 || response.status === 403 ? "AUTH_ERROR" : response.status >= 500 ? "UPSTREAM_5XX" : "UPSTREAM_4XX";
    throw new ProviderGatewayError(errorClass, `Official source returned HTTP ${response.status}`, response.status === 408 || response.status === 429 || response.status >= 500, response.status);
  }
  return response.text();
}

export function numericValue(value: unknown): number | null {
  if (value === null || value === undefined || value === "" || value === ".") return null;
  const parsed = Number(String(value).replaceAll(",", ""));
  return Number.isFinite(parsed) ? parsed : null;
}
