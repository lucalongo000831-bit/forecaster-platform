import "server-only";

import { calendarEvents, getDatabase, isDatabaseConfigured } from "@/db";
import { structuredLog } from "@/lib/server/logger";
import type { MarketCalendarAnalysis } from "@/types";

export async function persistCalendarEvents(analysis: MarketCalendarAnalysis) {
  if (!isDatabaseConfigured() || !analysis.events.length) return false;
  try {
    const database = getDatabase();
    for (const event of analysis.events) await database.insert(calendarEvents).values({ eventType: event.type, symbol: event.symbol, title: event.title, startsAt: new Date(`${event.date}T${event.time && /^\d{2}:\d{2}$/.test(event.time) ? event.time : "00:00"}:00Z`), payload: { estimate: event.estimate, actual: event.actual, previous: event.previous, unit: event.unit, details: event.details }, provider: event.provider, providerRecordId: event.id, sourceTimestamp: new Date(`${event.date}T00:00:00Z`), quality: "PARTIAL", metadata: { country: event.country, importance: event.importance } }).onConflictDoUpdate({ target: [calendarEvents.provider, calendarEvents.providerRecordId], set: { title: event.title, startsAt: new Date(`${event.date}T00:00:00Z`), payload: { estimate: event.estimate, actual: event.actual, previous: event.previous, unit: event.unit, details: event.details }, updatedAt: new Date() } });
    return true;
  } catch (error) { structuredLog("warn", "calendar.persistence.failed", { code: error instanceof Error ? error.name : "UNKNOWN", events: analysis.events.length }); return false; }
}
