import "server-only";

import { and, asc, eq, gte, lte } from "drizzle-orm";
import { calendarEvents, economicReleaseEvents, getDatabase, isDatabaseConfigured } from "@/db";
import { structuredLog } from "@/lib/server/logger";
import type { MarketCalendarAnalysis } from "@/types";

function numberOrNull(value: unknown) { if (value === null || value === undefined || value === "") return null; const parsed = Number(value); return Number.isFinite(parsed) ? parsed : null; }
function calendarImportance(value: unknown): "LOW" | "MEDIUM" | "HIGH" { return value === "HIGH" || value === "MEDIUM" ? value : "LOW"; }

export async function loadPersistedCalendar(from: string, to: string, symbol?: string): Promise<MarketCalendarAnalysis | null> {
  if (!isDatabaseConfigured()) return null;
  try {
    const start = new Date(`${from}T00:00:00Z`); const end = new Date(`${to}T23:59:59.999Z`); const database = getDatabase();
    const condition = symbol ? and(gte(calendarEvents.startsAt, start), lte(calendarEvents.startsAt, end), eq(calendarEvents.symbol, symbol.toUpperCase())) : and(gte(calendarEvents.startsAt, start), lte(calendarEvents.startsAt, end));
    const [stored, releases] = await Promise.all([
      database.select().from(calendarEvents).where(condition).orderBy(asc(calendarEvents.startsAt)),
      symbol ? Promise.resolve([]) : database.select().from(economicReleaseEvents).where(and(gte(economicReleaseEvents.scheduledAt, start), lte(economicReleaseEvents.scheduledAt, end))).orderBy(asc(economicReleaseEvents.scheduledAt)),
    ]);
    if (!stored.length && !releases.length) return null;
    const events: MarketCalendarAnalysis["events"] = [
      ...stored.map((row) => { const payload = row.payload; const metadata = row.metadata; return { id: row.providerRecordId, type: row.eventType as "EARNINGS" | "DIVIDEND" | "MACRO", title: row.title, date: row.startsAt.toISOString().slice(0, 10), time: row.startsAt.getUTCHours() || row.startsAt.getUTCMinutes() ? row.startsAt.toISOString().slice(11, 16) : null, symbol: row.symbol, country: typeof metadata.country === "string" ? metadata.country : null, importance: calendarImportance(metadata.importance), provider: row.provider, estimate: numberOrNull(payload.estimate), actual: numberOrNull(payload.actual), previous: numberOrNull(payload.previous), unit: typeof payload.unit === "string" ? payload.unit : null, timezone: "UTC", company: row.symbol, currency: typeof payload.currency === "string" ? payload.currency : null, sourceTimestamp: row.sourceTimestamp?.toISOString() ?? null, details: payload as Record<string, string | number | null> }; }),
      ...releases.map((row) => ({ id: row.sourceId, type: "MACRO" as const, title: row.title, date: row.scheduledAt.toISOString().slice(0, 10), time: row.scheduledAt.toISOString().slice(11, 16), symbol: null, country: row.country, importance: calendarImportance(row.importance), provider: row.provider, estimate: numberOrNull(row.forecast), actual: numberOrNull(row.actual), previous: numberOrNull(row.previous), unit: null, timezone: "UTC", company: null, currency: null, sourceTimestamp: row.publishedAt?.toISOString() ?? row.updatedAt.toISOString(), details: row.metadata as Record<string, string | number | null> })),
    ].sort((a, b) => `${a.date}${a.time ?? ""}`.localeCompare(`${b.date}${b.time ?? ""}`));
    const calculatedAt = [...stored.map((row) => row.updatedAt), ...releases.map((row) => row.updatedAt)].sort((a, b) => b.getTime() - a.getTime())[0]?.toISOString() ?? new Date().toISOString();
    const availability = Object.fromEntries((["EARNINGS", "DIVIDEND", "MACRO"] as const).map((type) => { const rows = events.filter((event) => event.type === type); return [type, { status: rows.length ? "AVAILABLE" as const : "SOURCE_UNAVAILABLE" as const, provider: rows.length ? [...new Set(rows.map((event) => event.provider))].join(" / ") : null, reason: rows.length ? null : "Nessun dataset persistito per questa categoria; zero non verificato.", count: rows.length || null, lastUpdated: rows.length ? calculatedAt : null, isLastKnownGood: true }]; })) as MarketCalendarAnalysis["availability"];
    return { from, to, monthLabel: new Intl.DateTimeFormat("en-US", { month: "long", year: "numeric", timeZone: "UTC" }).format(start), events, availability, persisted: true, calculatedAt };
  } catch (error) { structuredLog("warn", "calendar.persistence.read_failed", { code: error instanceof Error ? error.name : "UNKNOWN" }); return null; }
}

export async function persistCalendarEvents(analysis: MarketCalendarAnalysis) {
  if (!isDatabaseConfigured() || !analysis.events.length) return false;
  try {
    const database = getDatabase();
    for (const event of analysis.events) await database.insert(calendarEvents).values({ eventType: event.type, symbol: event.symbol, title: event.title, startsAt: new Date(`${event.date}T${event.time && /^\d{2}:\d{2}$/.test(event.time) ? event.time : "00:00"}:00Z`), payload: { estimate: event.estimate, actual: event.actual, previous: event.previous, unit: event.unit, details: event.details }, provider: event.provider, providerRecordId: event.id, sourceTimestamp: new Date(`${event.date}T00:00:00Z`), quality: "PARTIAL", metadata: { country: event.country, importance: event.importance } }).onConflictDoUpdate({ target: [calendarEvents.provider, calendarEvents.providerRecordId], set: { title: event.title, startsAt: new Date(`${event.date}T00:00:00Z`), payload: { estimate: event.estimate, actual: event.actual, previous: event.previous, unit: event.unit, details: event.details }, updatedAt: new Date() } });
    return true;
  } catch (error) { structuredLog("warn", "calendar.persistence.failed", { code: error instanceof Error ? error.name : "UNKNOWN", events: analysis.events.length }); return false; }
}
