import "server-only";

import { providerCached } from "@/providers/cache";
import { ProviderError } from "@/providers/errors";
import { providerResult } from "@/providers/metadata";
import { financialProviderRouter } from "@/providers/router";
import type { HistoricalCompanyPeriod } from "@/types";

const monetaryFields: Array<keyof HistoricalCompanyPeriod> = ["revenue", "grossProfit", "ebitda", "operatingIncome", "netIncome", "dilutedEps", "cash", "totalAssets", "goodwill", "intangibles", "totalDebt", "netDebt", "equity", "workingCapital", "operatingCashFlow", "capitalExpenditure", "freeCashFlow", "acquisitions", "buybacks", "shareIssuance", "dividends", "stockBasedCompensation"];

async function chartRate(base: string, quote: string, date: string) {
  const chart = await financialProviderRouter.analyticsChart(`${base}${quote}=X`, "MAX", "1d");
  const point = [...chart.data.points].reverse().find((item) => item.timestamp.slice(0, 10) <= date) ?? chart.data.points[0];
  if (!point?.close || point.close <= 0) throw new ProviderError(chart.meta.provider, "NOT_FOUND", "Tasso FX storico non disponibile.", false, 404);
  return { rate: point.close, timestamp: point.timestamp, provider: chart.meta.provider };
}

export async function getHistoricalFxRate(from: string, to: string, date: string) {
  const base = from.toUpperCase(); const quote = to.toUpperCase();
  if (base === quote) return { rate: 1, timestamp: `${date}T00:00:00.000Z`, provider: "calculated" as const };
  return (await providerCached(`fx:${base}:${quote}:${date}`, { freshSeconds: 86_400, staleSeconds: 604_800 }, async () => {
    try { const direct = await chartRate(base, quote, date); return providerResult(direct.provider, direct, { sourceTimestamp: direct.timestamp, freshness: "cached", freshnessType: "END_OF_DAY" }); }
    catch { const reverse = await chartRate(quote, base, date); const data = { rate: 1 / reverse.rate, timestamp: reverse.timestamp, provider: reverse.provider }; return providerResult(reverse.provider, data, { sourceTimestamp: reverse.timestamp, freshness: "cached", freshnessType: "END_OF_DAY" }); }
  })).data;
}

export async function convertHistoricalPeriods(periods: HistoricalCompanyPeriod[], targetCurrency: string) {
  return Promise.all(periods.map(async (period) => {
    if (!period.currency || period.currency === targetCurrency) return period;
    const fx = await getHistoricalFxRate(period.currency, targetCurrency, period.fiscalDate);
    const converted = { ...period, currency: targetCurrency };
    for (const field of monetaryFields) { const value = period[field]; if (typeof value === "number") (converted as unknown as Record<string, unknown>)[field] = value * fx.rate; }
    return converted;
  }));
}
