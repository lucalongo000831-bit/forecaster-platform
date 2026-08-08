import "server-only";

import { getServerEnvironment } from "@/schemas/env";
import { fmpGet, numberValue, stringValue } from "../fmp/client";
import { providerResult } from "../metadata";
import type { MacroObservation, MacroProvider } from "../types";

const indicatorName: Record<MacroObservation["indicator"], string> = { INFLATION: "inflationRate", RATES: "federalFunds", GDP: "GDP", EMPLOYMENT: "unemploymentRate" };

export class FmpMacroAdapter implements MacroProvider {
  readonly name = "fmp" as const;
  isConfigured() { return Boolean(getServerEnvironment().FMP_API_KEY); }
  async getIndicator(indicator: MacroObservation["indicator"]) {
    const rows = await fmpGet("economic-indicators", { name: indicatorName[indicator] }, `macro:${indicator.toLowerCase()}`);
    const data = rows.flatMap((row): MacroObservation[] => {
      const date = stringValue(row, "date");
      if (!date) return [];
      return [{ indicator, date: date.slice(0, 10), value: numberValue(row, "value"), unit: stringValue(row, "unit"), country: stringValue(row, "country") ?? "US" }];
    });
    return providerResult(this.name, data, { sourceTimestamp: data[0]?.date ?? null, freshness: "cached", freshnessType: "CACHED", quality: data.length ? "verified" : "partial" });
  }
}
