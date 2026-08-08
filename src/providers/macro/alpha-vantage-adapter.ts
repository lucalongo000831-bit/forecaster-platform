import "server-only";

import { z } from "zod";
import { getServerEnvironment } from "@/schemas/env";
import { enforceRateLimit } from "@/lib/server/rate-limit";
import { providerRequest } from "../http";
import { ProviderError } from "../errors";
import { providerResult } from "../metadata";
import type { MacroObservation, MacroProvider } from "../types";

const responseSchema = z.object({
  name: z.string().optional(),
  interval: z.string().optional(),
  unit: z.string().optional(),
  data: z.array(z.object({ date: z.string(), value: z.union([z.string(), z.number()]) })).optional(),
  Note: z.string().optional(),
  Information: z.string().optional(),
  "Error Message": z.string().optional(),
});
const functionName: Record<MacroObservation["indicator"], string> = { INFLATION: "INFLATION", RATES: "FEDERAL_FUNDS_RATE", GDP: "REAL_GDP", EMPLOYMENT: "UNEMPLOYMENT" };

export class AlphaVantageMacroAdapter implements MacroProvider {
  readonly name = "alpha-vantage" as const;
  isConfigured() { return Boolean(getServerEnvironment().ALPHA_VANTAGE_API_KEY); }
  async getIndicator(indicator: MacroObservation["indicator"]) {
    const env = getServerEnvironment();
    if (!env.ALPHA_VANTAGE_API_KEY) throw new ProviderError(this.name, "NOT_CONFIGURED", "Alpha Vantage non configurato.", false, 503);
    await enforceRateLimit("global", { scope: "provider:alpha-vantage", limit: 5, windowSeconds: 60 });
    const url = new URL("/query", env.ALPHA_VANTAGE_BASE_URL);
    url.searchParams.set("function", functionName[indicator]); url.searchParams.set("apikey", env.ALPHA_VANTAGE_API_KEY);
    if (indicator === "RATES") url.searchParams.set("interval", "monthly");
    if (indicator === "GDP") url.searchParams.set("interval", "quarterly");
    const response = await providerRequest({ provider: this.name, operation: `macro:${indicator.toLowerCase()}`, url, schema: responseSchema, timeoutMs: 15_000, retries: 0 });
    const message = response.Note ?? response.Information ?? response["Error Message"];
    if (message) throw new ProviderError(this.name, /rate|frequency|limit/i.test(message) ? "RATE_LIMITED" : "UPSTREAM_UNAVAILABLE", "Dato macro Alpha Vantage non disponibile.", true, 502);
    const data = (response.data ?? []).flatMap((row): MacroObservation[] => {
      const value = typeof row.value === "number" ? row.value : Number(row.value);
      return [{ indicator, date: row.date, value: Number.isFinite(value) ? value : null, unit: response.unit ?? null, country: "US" }];
    });
    return providerResult(this.name, data, { sourceTimestamp: data[0]?.date ?? null, freshness: "cached", freshnessType: "CACHED", quality: data.length ? "verified" : "partial" });
  }
}
