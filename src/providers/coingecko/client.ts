import "server-only";

import { z } from "zod";
import { ProviderError } from "../errors";
import { providerRequest } from "../http";
import { getCoinGeckoConfiguration } from "./config";

export async function coinGeckoGet(path: string, params: Record<string, string | number | boolean | undefined>, operation: string) {
  const configuration = getCoinGeckoConfiguration();
  if (!configuration.configured) throw new ProviderError("coingecko", "NOT_CONFIGURED", "CoinGecko non configurato.", false, 503);
  const url = new URL(path.replace(/^\/+/, ""), configuration.baseUrl);
  for (const [key, value] of Object.entries(params)) if (value !== undefined) url.searchParams.set(key, String(value));
  return providerRequest({ provider: "coingecko", operation, url, schema: z.unknown(), headers: configuration.headers, timeoutMs: 14_000, retries: 1 });
}
