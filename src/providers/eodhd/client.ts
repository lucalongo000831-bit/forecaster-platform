import "server-only";

import { z } from "zod";
import { getServerEnvironment } from "@/schemas/env";
import { ProviderError } from "../errors";
import { providerRequest } from "../http";

const responseSchema = z.unknown();

export async function eodhdGet(path: string, params: Record<string, string | number | undefined>, operation: string) {
  const token = getServerEnvironment().EODHD_API_TOKEN;
  if (!token) throw new ProviderError("eodhd", "NOT_CONFIGURED", "EODHD non configurato.", false, 503);
  const url = new URL(`/api/${path.replace(/^\/+/, "")}`, "https://eodhd.com");
  url.searchParams.set("api_token", token);
  url.searchParams.set("fmt", "json");
  for (const [key, value] of Object.entries(params)) if (value !== undefined) url.searchParams.set(key, String(value));
  try {
    return await providerRequest({ provider: "eodhd", operation, url, schema: responseSchema, timeoutMs: 16_000, retries: 1 });
  } catch (error) {
    if (error instanceof ProviderError && error.code === "UNAUTHORIZED" && error.status === 502) throw new ProviderError("eodhd", "PLAN_RESTRICTED", "Endpoint EODHD non incluso nel piano configurato.", false, 502, { cause: error });
    throw error;
  }
}
