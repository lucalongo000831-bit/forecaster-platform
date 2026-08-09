import "server-only";

import { z } from "zod";
import { ProviderError } from "../errors";
import { providerRequest } from "../http";
import { getSecConfiguration } from "./config";
import { coordinatedProviderRequest } from "../coordinator";

export function normalizeCik(value: string | number) {
  const digits = String(value).replace(/\D/g, "");
  if (!digits || digits.length > 10) throw new ProviderError("sec-edgar", "UNSUPPORTED_SYMBOL", "CIK SEC non valido.", false, 422);
  return digits.padStart(10, "0");
}

export async function secGet(path: string, operation: string) {
  const configuration = getSecConfiguration();
  if (!configuration.configured) throw new ProviderError("sec-edgar", "NOT_CONFIGURED", "SEC EDGAR non configurato.", false, 503);
  const url = new URL(path, configuration.baseUrl);
  return providerRequest({ provider: "sec-edgar", operation, url, schema: z.unknown(), headers: configuration.headers, timeoutMs: 16_000, retries: 1 });
}

export async function secPublicGet(url: URL, operation: string) {
  const configuration = getSecConfiguration();
  if (!configuration.configured) throw new ProviderError("sec-edgar", "NOT_CONFIGURED", "SEC EDGAR non configurato.", false, 503);
  const headers = { "User-Agent": configuration.headers["User-Agent"], "Accept-Encoding": "gzip, deflate" };
  return providerRequest({ provider: "sec-edgar", operation, url, schema: z.unknown(), headers, timeoutMs: 16_000, retries: 1 });
}

export async function secArchiveText(url: URL) {
  const configuration = getSecConfiguration();
  if (!configuration.configured) throw new ProviderError("sec-edgar", "NOT_CONFIGURED", "SEC EDGAR non configurato.", false, 503);
  if (url.protocol !== "https:" || url.hostname !== "www.sec.gov" || !url.pathname.startsWith("/Archives/edgar/data/")) throw new ProviderError("sec-edgar", "UNSUPPORTED_SYMBOL", "URL archivio SEC non consentito.", false, 422);
  const response = await coordinatedProviderRequest("sec-edgar", () => fetch(url, { headers: { "User-Agent": configuration.headers["User-Agent"], Accept: "application/xml,text/xml" }, redirect: "error", cache: "no-store", signal: AbortSignal.timeout(16_000) }));
  if (!response.ok) throw new ProviderError("sec-edgar", response.status === 404 ? "NOT_FOUND" : response.status === 429 ? "RATE_LIMITED" : "UPSTREAM_UNAVAILABLE", "Documento Form 4 SEC non disponibile.", response.status === 429 || response.status >= 500, response.status === 404 ? 404 : 502);
  return response.text();
}
