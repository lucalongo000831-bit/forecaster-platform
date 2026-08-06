import "server-only";

import { composeCalendarAnalysis } from "@/lib/calendar-events";
import { financialProviderRouter } from "@/providers";
import { persistCalendarEvents } from "./calendar-repository";

function errorReason(error: unknown) { return error instanceof Error && /plan|subscription|inclus|disponibil/i.test(error.message) ? "Non incluso nel piano provider configurato." : "Provider temporaneamente non disponibile."; }

export async function getMarketCalendar(from: string, to: string, symbol?: string) {
  const [earnings, dividends, macro] = await Promise.allSettled([financialProviderRouter.earningsCalendar(from, to, symbol), financialProviderRouter.dividendCalendar(from, to, symbol), financialProviderRouter.economicCalendar(from, to)]);
  const analysis = composeCalendarAnalysis({ from, to,
    earnings: earnings.status === "fulfilled" ? { data: earnings.value.data, provider: earnings.value.meta.provider } : null,
    dividends: dividends.status === "fulfilled" ? { data: dividends.value.data, provider: dividends.value.meta.provider } : null,
    macro: macro.status === "fulfilled" ? { data: macro.value.data, provider: macro.value.meta.provider } : null,
    errors: { EARNINGS: earnings.status === "rejected" ? errorReason(earnings.reason) : undefined, DIVIDEND: dividends.status === "rejected" ? errorReason(dividends.reason) : undefined, MACRO: macro.status === "rejected" ? errorReason(macro.reason) : undefined },
  });
  return { ...analysis, persisted: await persistCalendarEvents(analysis) };
}
