import "server-only";

import { and, count, eq, gte, lte } from "drizzle-orm";
import { calendarEvents, dataSnapshots, economicReleaseEvents, getDatabase, isDatabaseConfigured, politicalTransactions, rawProviderRecords } from "@/db";

export interface DataPathTrace {
  dataset: string;
  category: string | null;
  symbol: string | null;
  from: string | null;
  to: string | null;
  counts: { raw: number; normalized: number; database: number; snapshot: number; apiConsumable: number; uiConsumable: number };
  source: string[];
  warnings: string[];
  tracedAt: string;
}

const date = (value: string, end = false) => new Date(`${value}T${end ? "23:59:59.999" : "00:00:00"}Z`);
async function counted(query: Promise<Array<{ value: number }>>) { return (await query)[0]?.value ?? 0; }

export async function traceDataPath(input: { dataset: "calendar" | "political" | "global"; category?: string; symbol?: string; from?: string; to?: string }): Promise<DataPathTrace> {
  const base = { dataset: input.dataset, category: input.category?.toUpperCase() ?? null, symbol: input.symbol?.toUpperCase() ?? null, from: input.from ?? null, to: input.to ?? null, source: [] as string[], warnings: [] as string[], tracedAt: new Date().toISOString() };
  if (!isDatabaseConfigured()) return { ...base, counts: { raw: 0, normalized: 0, database: 0, snapshot: 0, apiConsumable: 0, uiConsumable: 0 }, warnings: ["DATABASE_NOT_CONFIGURED"] };
  const database = getDatabase();
  if (input.dataset === "calendar") {
    const start = date(input.from ?? "1970-01-01"); const end = date(input.to ?? "2999-12-31", true); const category = input.category?.toUpperCase();
    const eventCondition = and(gte(calendarEvents.startsAt, start), lte(calendarEvents.startsAt, end), ...(category ? [eq(calendarEvents.eventType, category)] : []), ...(input.symbol ? [eq(calendarEvents.symbol, input.symbol.toUpperCase())] : []));
    const releaseCondition = and(gte(economicReleaseEvents.scheduledAt, start), lte(economicReleaseEvents.scheduledAt, end));
    const [stored, releases, raw, snapshots] = await Promise.all([counted(database.select({ value: count() }).from(calendarEvents).where(eventCondition)), input.symbol || (category && !["MACRO", "CENTRAL_BANK"].includes(category)) ? 0 : counted(database.select({ value: count() }).from(economicReleaseEvents).where(releaseCondition)), counted(database.select({ value: count() }).from(rawProviderRecords).where(eq(rawProviderRecords.dataset, "economic_release_dates"))), counted(database.select({ value: count() }).from(dataSnapshots).where(eq(dataSnapshots.dataset, "market_calendar")))]);
    const normalized = stored + releases; const sources = releases ? ["economic_release_events"] : []; if (stored) sources.push("calendar_events"); if (!normalized) base.warnings.push("NO_NORMALIZED_ROWS");
    return { ...base, source: sources, counts: { raw, normalized, database: normalized, snapshot: snapshots, apiConsumable: normalized, uiConsumable: normalized } };
  }
  if (input.dataset === "political") {
    const start = date(input.from ?? "1970-01-01");
    const end = date(input.to ?? "2999-12-31", true);
    const conditions = and(
      gte(politicalTransactions.disclosureDate, start),
      lte(politicalTransactions.disclosureDate, end),
      ...(input.symbol ? [eq(politicalTransactions.symbol, input.symbol.toUpperCase())] : []),
    );
    const [stored, raw, snapshots] = await Promise.all([counted(database.select({ value: count() }).from(politicalTransactions).where(conditions)), counted(database.select({ value: count() }).from(rawProviderRecords).where(eq(rawProviderRecords.dataset, "political_disclosures"))), counted(database.select({ value: count() }).from(dataSnapshots).where(eq(dataSnapshots.dataset, "political_disclosures")))]); if (!stored) base.warnings.push("NO_MATCHING_POLITICAL_ROWS_ZERO_NOT_VERIFIED_BY_TRACE_ALONE");
    return { ...base, source: ["political_transactions"], counts: { raw, normalized: stored, database: stored, snapshot: snapshots, apiConsumable: stored, uiConsumable: stored } };
  }
  const snapshots = await counted(database.select({ value: count() }).from(dataSnapshots).where(eq(dataSnapshots.dataset, "global_risk"))); const raw = await counted(database.select({ value: count() }).from(rawProviderRecords));
  return { ...base, source: ["data_snapshots", "normalized_economic_observations", "positioning_observations", "news_items"], counts: { raw, normalized: snapshots, database: snapshots, snapshot: snapshots, apiConsumable: snapshots, uiConsumable: snapshots } };
}
