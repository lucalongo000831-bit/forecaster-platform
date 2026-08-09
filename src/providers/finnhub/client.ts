import "server-only";

import { z } from "zod";
import { getServerEnvironment } from "@/schemas/env";
import { ProviderError } from "../errors";
import { providerRequest } from "../http";

export async function finnhubGet(path: string, params: Record<string, string | number | undefined>, operation: string) {
  const apiKey = getServerEnvironment().FINNHUB_API_KEY;
  if (!apiKey) throw new ProviderError("finnhub", "NOT_CONFIGURED", "Finnhub non configurato.", false, 503);
  const url = new URL(`/api/v1/${path.replace(/^\/+/, "")}`, "https://finnhub.io");
  for (const [key, value] of Object.entries(params)) if (value !== undefined) url.searchParams.set(key, String(value));
  return providerRequest({ provider: "finnhub", operation, url, schema: z.unknown(), headers: { "X-Finnhub-Token": apiKey }, timeoutMs: 14_000, retries: 1 });
}
