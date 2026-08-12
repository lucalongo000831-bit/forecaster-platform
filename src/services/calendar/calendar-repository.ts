import "server-only";

import { and, asc, eq, gte, inArray, lte } from "drizzle-orm";
import { calendarEvents, economicReleaseEvents, getDatabase, isDatabaseConfigured, providerWatermarks } from "@/db";
import { structuredLog } from "@/lib/server/logger";
import type { CalendarEventType, MarketCalendarAnalysis } from "@/types";

function numberOrNull(value: unknown) { if (value === null || value === undefined || value === "") return null; const parsed = Number(value); return Number.isFinite(parsed) ? parsed : null; }
function calendarImportance(value: unknown): "LOW" | "MEDIUM" | "HIGH" { return value === "HIGH" || value === "MEDIUM" ? value : "LOW"; }
const categories: CalendarEventType[] = ["EARNINGS", "DIVIDEND", "MACRO", "CENTRAL_BANK"];
const coreFredReleaseIds = new Set([9, 10, 13, 27, 46, 47, 50, 51, 53, 54, 97, 192]);
function macroType(title: string): CalendarEventType { return /central bank|interest rate|rate decision|fomc|ecb|boe|boj|monetary policy/i.test(title) ? "CENTRAL_BANK" : "MACRO"; }
function storedType(value: string, title: string): CalendarEventType { return value === "EARNINGS" || value === "DIVIDEND" || value === "CENTRAL_BANK" ? value : macroType(title); }
export function isSupportedCalendarRelease(provider: string, sourceId: string) {
  if (provider !== "fred") return true;
  const releaseId = Number(sourceId.split(":", 1)[0]);
  return Number.isInteger(releaseId) && coreFredReleaseIds.has(releaseId);
}
export function watermarkCovers(metadata: Record<string, unknown>, from: string, to: string) {
  return typeof metadata.from === "string" && typeof metadata.to === "string" && metadata.from <= from && metadata.to >= to;
}

export async function loadPersistedCalendar(from: string, to: string, symbol?: string): Promise<MarketCalendarAnalysis | null> {
  if (!isDatabaseConfigured()) return null;
  try {
    const start = new Date(`${from}T00:00:00Z`); const end = new Date(`${to}T23:59:59.999Z`); const database = getDatabase();
    const condition = symbol ? and(gte(calendarEvents.startsAt, start), lte(calendarEvents.startsAt, end), eq(calendarEvents.symbol, symbol.toUpperCase())) : and(gte(calendarEvents.startsAt, start), lte(calendarEvents.startsAt, end));
    const [stored, releases, watermarks] = await Promise.all([
      database.select().from(calendarEvents).where(condition).orderBy(asc(calendarEvents.startsAt)),
      symbol ? Promise.resolve([]) : database.select().from(economicReleaseEvents).where(and(gte(economicReleaseEvents.scheduledAt, start), lte(economicReleaseEvents.scheduledAt, end))).orderBy(asc(economicReleaseEvents.scheduledAt)),
      symbol ? Promise.resolve([]) : database.select().from(providerWatermarks).where(inArray(providerWatermarks.dataset, ["economic_release_events", "central_bank_calendar"])),
    ]);
    if (!stored.length && !releases.length && !watermarks.some((item) => item.lastSuccessfulSync)) return null;
    const supportedReleases = releases.filter((row) => isSupportedCalendarRelease(row.provider, row.sourceId));
    const events: MarketCalendarAnalysis["events"] = [
      ...stored.map((row) => { const payload = row.payload; const metadata = row.metadata; const nestedDetails = payload.details && typeof payload.details === "object" ? payload.details as Record<string, string | number | null> : {}; return { id: row.providerRecordId, type: storedType(row.eventType, row.title), title: row.title, date: row.startsAt.toISOString().slice(0, 10), time: row.startsAt.getUTCHours() || row.startsAt.getUTCMinutes() ? row.startsAt.toISOString().slice(11, 16) : null, symbol: row.symbol, country: typeof metadata.country === "string" ? metadata.country : null, importance: calendarImportance(metadata.importance), provider: row.provider, estimate: numberOrNull(payload.estimate), actual: numberOrNull(payload.actual), previous: numberOrNull(payload.previous), unit: typeof payload.unit === "string" ? payload.unit : null, timezone: "UTC", company: row.symbol, currency: typeof payload.currency === "string" ? payload.currency : typeof nestedDetails.currency === "string" ? nestedDetails.currency : null, sourceTimestamp: row.sourceTimestamp?.toISOString() ?? null, details: nestedDetails }; }),
      ...supportedReleases.map((row) => ({ id: row.sourceId, type: macroType(row.title), title: row.title, date: row.scheduledAt.toISOString().slice(0, 10), time: row.scheduledAt.toISOString().slice(11, 16), symbol: null, country: row.country, importance: calendarImportance(row.importance), provider: row.provider, estimate: numberOrNull(row.forecast), actual: numberOrNull(row.actual), previous: numberOrNull(row.previous), unit: typeof row.metadata.unit === "string" ? row.metadata.unit : null, timezone: "UTC", company: null, currency: typeof row.metadata.currency === "string" ? row.metadata.currency : null, sourceTimestamp: row.publishedAt?.toISOString() ?? row.updatedAt.toISOString(), details: { ...(row.metadata as Record<string, string | number | null>), forecast: numberOrNull(row.forecast), actual: numberOrNull(row.actual), previous: numberOrNull(row.previous), releaseStatus: row.actual === null ? "PENDING" : "RELEASED" } })),
    ];
    const uniqueEvents = [...new Map(events.map((event) => [`${event.type}:${event.id}`, event])).values()].sort((a, b) => `${a.date}${a.time ?? ""}`.localeCompare(`${b.date}${b.time ?? ""}`));
    const calculatedAt = [...stored.map((row) => row.updatedAt), ...supportedReleases.map((row) => row.updatedAt)].sort((a, b) => b.getTime() - a.getTime())[0]?.toISOString() ?? new Date().toISOString();
    const categorySources: Partial<Record<CalendarEventType, string[]>> = { MACRO: ["fred"], CENTRAL_BANK: ["federal-reserve", "ecb"] };
    const availability = Object.fromEntries(categories.map((type) => {
      const rows = uniqueEvents.filter((event) => event.type === type);
      const expectedProviders = categorySources[type] ?? [];
      const successfulWatermarks = watermarks.filter((item) => expectedProviders.includes(item.provider) && item.lastSuccessfulSync && watermarkCovers(item.metadata, from, to));
      const verifiedDataset = expectedProviders.length > 0 && successfulWatermarks.length > 0;
      const available = rows.length > 0 || verifiedDataset;
      const providers = rows.length ? [...new Set(rows.map((event) => event.provider))] : successfulWatermarks.map((item) => item.provider);
      return [type, { status: available ? "AVAILABLE" as const : "SOURCE_UNAVAILABLE" as const, provider: providers.length ? providers.join(" / ") : null, reason: available ? rows.length ? null : "Zero eventi verificato dalla fonte ufficiale nel periodo." : "Nessun dataset persistito per questa categoria; zero non verificato.", count: available ? rows.length : null, lastUpdated: available ? calculatedAt : null, isLastKnownGood: true }];
    })) as MarketCalendarAnalysis["availability"];
    const availableCategories = categories.filter((type) => availability[type].status === "AVAILABLE");
    return { from, to, monthLabel: new Intl.DateTimeFormat("en-US", { month: "long", year: "numeric", timeZone: "UTC" }).format(start), events: uniqueEvents, availability, coverage: { implementedCategories: categories, availableCategories, categoryCoverage: Object.fromEntries(categories.map((type) => [type, availability[type].status === "AVAILABLE" ? 100 : 0])) as Record<CalendarEventType, number>, overallCoverage: availableCategories.length / categories.length * 100 }, persisted: true, calculatedAt };
  } catch (error) { structuredLog("warn", "calendar.persistence.read_failed", { code: error instanceof Error ? error.name : "UNKNOWN" }); return null; }
}

export async function persistCalendarEvents(analysis: MarketCalendarAnalysis) {
  if (!isDatabaseConfigured() || !analysis.events.length) return false;
  try {
    const database = getDatabase();
    for (const event of analysis.events) { const startsAt = new Date(`${event.date}T${event.time && /^\d{2}:\d{2}$/.test(event.time) ? event.time : "00:00"}:00Z`); await database.insert(calendarEvents).values({ eventType: event.type, symbol: event.symbol, title: event.title, startsAt, payload: { estimate: event.estimate, actual: event.actual, previous: event.previous, unit: event.unit, currency: event.currency, details: event.details }, provider: event.provider, providerRecordId: event.id, sourceTimestamp: event.sourceTimestamp ? new Date(event.sourceTimestamp) : startsAt, quality: "PARTIAL", metadata: { country: event.country, importance: event.importance } }).onConflictDoUpdate({ target: [calendarEvents.provider, calendarEvents.providerRecordId], set: { eventType: event.type, symbol: event.symbol, title: event.title, startsAt, sourceTimestamp: event.sourceTimestamp ? new Date(event.sourceTimestamp) : startsAt, payload: { estimate: event.estimate, actual: event.actual, previous: event.previous, unit: event.unit, currency: event.currency, details: event.details }, metadata: { country: event.country, importance: event.importance }, updatedAt: new Date() } }); }
    return true;
  } catch (error) { structuredLog("warn", "calendar.persistence.failed", { code: error instanceof Error ? error.name : "UNKNOWN", events: analysis.events.length }); return false; }
}
