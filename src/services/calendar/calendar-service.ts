import "server-only";

import { composeCalendarAnalysis } from "@/lib/calendar-events";
import { financialProviderRouter } from "@/providers";
import { loadLastKnownGood, publishDatasetSnapshot } from "@/services/data-v2";
import type { MarketCalendarAnalysis } from "@/types";
import { loadPersistedCalendar, persistCalendarEvents } from "./calendar-repository";

function errorReason(error: unknown) { return error instanceof Error && /plan|subscription|inclus|disponibil/i.test(error.message) ? "Non incluso nel piano provider configurato." : "Provider temporaneamente non disponibile."; }

export async function getMarketCalendar(from: string, to: string, symbol?: string, options: { force?: boolean } = {}) {
  const entityKey = `${from}:${to}:${symbol?.toUpperCase() ?? "global"}`;
  if (!options.force) {
    const persisted = await loadPersistedCalendar(from, to, symbol);
    if (persisted) return persisted;
    const lkg = await loadLastKnownGood<MarketCalendarAnalysis>("market_calendar", entityKey);
    if (lkg) return { ...lkg.payload, persisted: true, calculatedAt: lkg.calculatedAt, availability: Object.fromEntries(Object.entries(lkg.payload.availability).map(([key, value]) => [key, { ...value, status: "STALE", isLastKnownGood: true }])) as MarketCalendarAnalysis["availability"] };
  }
  const [earnings, dividends, macro] = await Promise.allSettled([financialProviderRouter.earningsCalendar(from, to, symbol), financialProviderRouter.dividendCalendar(from, to, symbol), financialProviderRouter.economicCalendar(from, to)]);
  const analysis = composeCalendarAnalysis({ from, to,
    earnings: earnings.status === "fulfilled" ? { data: earnings.value.data, provider: earnings.value.meta.provider } : null,
    dividends: dividends.status === "fulfilled" ? { data: dividends.value.data, provider: dividends.value.meta.provider } : null,
    macro: macro.status === "fulfilled" ? { data: macro.value.data, provider: macro.value.meta.provider } : null,
    errors: { EARNINGS: earnings.status === "rejected" ? errorReason(earnings.reason) : undefined, DIVIDEND: dividends.status === "rejected" ? errorReason(dividends.reason) : undefined, MACRO: macro.status === "rejected" ? errorReason(macro.reason) : undefined },
  });
  const persisted = await persistCalendarEvents(analysis); const output = { ...analysis, persisted };
  await publishDatasetSnapshot({ dataset: "market_calendar", entityKey, payload: output as unknown as Record<string, unknown>, recordCount: output.events.length, coverage: Object.values(output.availability).filter((item) => item.status === "AVAILABLE").length / 3 * 100, sourceSucceeded: [earnings, dividends, macro].some((result) => result.status === "fulfilled"), schemaValid: true, allowVerifiedEmpty: false, sourceTimestamp: output.calculatedAt, expiresAt: new Date(Date.now() + 6 * 3_600_000).toISOString(), freshness: "FRESH", schemaVersion: "market-calendar-v2" }).catch(() => undefined);
  return output;
}
