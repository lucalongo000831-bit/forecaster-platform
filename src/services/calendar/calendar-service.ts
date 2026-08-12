import "server-only";

import { composeCalendarAnalysis } from "@/lib/calendar-events";
import { financialProviderRouter } from "@/providers";
import { loadLastKnownGood, publishDatasetSnapshot } from "@/services/data-v2";
import { categoryContinuityReasons } from "@/services/data-v2/quality-gate";
import type { MarketCalendarAnalysis } from "@/types";
import { loadPersistedCalendar, persistCalendarEvents } from "./calendar-repository";

function errorReason(error: unknown) { return error instanceof Error && /plan|subscription|inclus|disponibil/i.test(error.message) ? "Non incluso nel piano provider configurato." : "Provider temporaneamente non disponibile."; }

export async function getMarketCalendar(from: string, to: string, symbol?: string, options: { force?: boolean } = {}) {
  const entityKey = `${from}:${to}:${symbol?.toUpperCase() ?? "global"}`;
  if (!options.force) {
    const persisted = await loadPersistedCalendar(from, to, symbol);
    if (persisted) return persisted;
    const lkg = await loadLastKnownGood<MarketCalendarAnalysis>("market_calendar", entityKey);
    if (lkg) {
      const implementedCategories = lkg.payload.coverage?.implementedCategories ?? ["EARNINGS", "DIVIDEND", "MACRO", "CENTRAL_BANK"] as const;
      const availability = Object.fromEntries(implementedCategories.map((key) => { const value = lkg.payload.availability[key] ?? { status: "SOURCE_UNAVAILABLE", provider: null, reason: "Category absent from legacy snapshot.", count: null, lastUpdated: null, isLastKnownGood: true }; return [key, { ...value, status: value.status === "AVAILABLE" ? "STALE" : value.status, isLastKnownGood: true }]; })) as MarketCalendarAnalysis["availability"];
      const availableCategories = implementedCategories.filter((key) => availability[key].status === "AVAILABLE" || availability[key].status === "STALE");
      return { ...lkg.payload, persisted: true, calculatedAt: lkg.calculatedAt, availability, coverage: lkg.payload.coverage ?? { implementedCategories: [...implementedCategories], availableCategories: [...availableCategories], categoryCoverage: Object.fromEntries(implementedCategories.map((key) => [key, availableCategories.includes(key) ? 100 : 0])) as MarketCalendarAnalysis["coverage"]["categoryCoverage"], overallCoverage: availableCategories.length / implementedCategories.length * 100 } };
    }
  }
  const [earnings, dividends, macro] = await Promise.allSettled([financialProviderRouter.earningsCalendar(from, to, symbol), financialProviderRouter.dividendCalendar(from, to, symbol), financialProviderRouter.economicCalendar(from, to)]);
  const analysis = composeCalendarAnalysis({ from, to,
    earnings: earnings.status === "fulfilled" ? { data: earnings.value.data, provider: earnings.value.meta.provider } : null,
    dividends: dividends.status === "fulfilled" ? { data: dividends.value.data, provider: dividends.value.meta.provider } : null,
    macro: macro.status === "fulfilled" ? { data: macro.value.data, provider: macro.value.meta.provider } : null,
    errors: { EARNINGS: earnings.status === "rejected" ? errorReason(earnings.reason) : undefined, DIVIDEND: dividends.status === "rejected" ? errorReason(dividends.reason) : undefined, MACRO: macro.status === "rejected" ? errorReason(macro.reason) : undefined },
  });
  const persisted = await persistCalendarEvents(analysis); const output = { ...analysis, persisted };
  const previous = await loadLastKnownGood<MarketCalendarAnalysis>("market_calendar", entityKey);
  const previousCounts = previous ? Object.fromEntries(Object.entries(previous.payload.availability).map(([key, value]) => [key, value.count])) : null;
  const candidateCounts = Object.fromEntries(Object.entries(output.availability).map(([key, value]) => [key, value.count]));
  const succeeded = new Set<string>();
  if (earnings.status === "fulfilled") succeeded.add("EARNINGS");
  if (dividends.status === "fulfilled") succeeded.add("DIVIDEND");
  if (macro.status === "fulfilled") { succeeded.add("MACRO"); succeeded.add("CENTRAL_BANK"); }
  const continuityReasons = categoryContinuityReasons(previousCounts, candidateCounts, succeeded);
  await publishDatasetSnapshot({ dataset: "market_calendar", entityKey, payload: { ...output, qualityReasons: continuityReasons } as unknown as Record<string, unknown>, recordCount: output.events.length, coverage: output.coverage.overallCoverage, sourceSucceeded: [earnings, dividends, macro].some((result) => result.status === "fulfilled"), schemaValid: continuityReasons.length === 0, allowVerifiedEmpty: false, sourceTimestamp: output.calculatedAt, expiresAt: new Date(Date.now() + 6 * 3_600_000).toISOString(), freshness: "FRESH", schemaVersion: "market-calendar-v2.1" }).catch(() => undefined);
  return output;
}
