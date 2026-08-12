import "server-only";

import { and, count, desc, eq, gte, lte, sql } from "drizzle-orm";
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
function payloadRecordCount(payload: Record<string, unknown>) {
  if (Array.isArray(payload.rows)) return payload.rows.length;
  if (Array.isArray(payload.meetings)) return payload.meetings.length;
  return 0;
}

export async function traceDataPath(input: { dataset: "calendar" | "political" | "global"; category?: string; symbol?: string; from?: string; to?: string }): Promise<DataPathTrace> {
  const base = { dataset: input.dataset, category: input.category?.toUpperCase() ?? null, symbol: input.symbol?.toUpperCase() ?? null, from: input.from ?? null, to: input.to ?? null, source: [] as string[], warnings: [] as string[], tracedAt: new Date().toISOString() };
  if (!isDatabaseConfigured()) return { ...base, counts: { raw: 0, normalized: 0, database: 0, snapshot: 0, apiConsumable: 0, uiConsumable: 0 }, warnings: ["DATABASE_NOT_CONFIGURED"] };
  const database = getDatabase();
  if (input.dataset === "calendar") {
    const start = date(input.from ?? "1970-01-01"); const end = date(input.to ?? "2999-12-31", true); const category = input.category?.toUpperCase();
    const eventCondition = and(gte(calendarEvents.startsAt, start), lte(calendarEvents.startsAt, end), ...(category ? [eq(calendarEvents.eventType, category)] : []), ...(input.symbol ? [eq(calendarEvents.symbol, input.symbol.toUpperCase())] : []));
    const macroClassifier = sql<boolean>`not (${economicReleaseEvents.title} ~* 'central bank|interest rate|rate decision|fomc|ecb|boe|boj|monetary policy')`;
    const centralBankClassifier = sql<boolean>`${economicReleaseEvents.title} ~* 'central bank|interest rate|rate decision|fomc|ecb|boe|boj|monetary policy'`;
    const releaseCondition = and(gte(economicReleaseEvents.scheduledAt, start), lte(economicReleaseEvents.scheduledAt, end), ...(category === "MACRO" ? [macroClassifier] : category === "CENTRAL_BANK" ? [centralBankClassifier] : []));
    const rawDataset = category === "CENTRAL_BANK" ? "central_bank_calendar" : "economic_release_dates";
    const rawEntityKey = input.from && input.to ? `${input.from}:${input.to}` : null;
    const [stored, releases, rawRows, snapshotRow] = await Promise.all([counted(database.select({ value: count() }).from(calendarEvents).where(eventCondition)), input.symbol || (category && !["MACRO", "CENTRAL_BANK"].includes(category)) ? 0 : counted(database.select({ value: count() }).from(economicReleaseEvents).where(releaseCondition)), database.select({ provider: rawProviderRecords.provider, payload: rawProviderRecords.payload }).from(rawProviderRecords).where(and(eq(rawProviderRecords.dataset, rawDataset), ...(rawEntityKey ? [eq(rawProviderRecords.entityKey, rawEntityKey)] : []))).orderBy(desc(rawProviderRecords.fetchedAt)), database.select({ payload: dataSnapshots.payload }).from(dataSnapshots).where(and(eq(dataSnapshots.dataset, "market_calendar"), eq(dataSnapshots.entityKey, `${input.from ?? "1970-01-01"}:${input.to ?? "2999-12-31"}:${input.symbol?.toUpperCase() ?? "global"}`), eq(dataSnapshots.published, true))).orderBy(desc(dataSnapshots.calculatedAt)).limit(1).then((rows) => rows[0] ?? null)]);
    const latestRaw = [...new Map(rawRows.map((row) => [row.provider, row])).values()];
    const raw = latestRaw.reduce((total, row) => total + payloadRecordCount(row.payload), 0);
    const normalized = stored + releases; const sources = releases ? ["economic_release_events"] : []; if (stored) sources.push("calendar_events"); if (!normalized) base.warnings.push("NO_NORMALIZED_ROWS");
    const snapshotEvents = Array.isArray(snapshotRow?.payload.events) ? snapshotRow.payload.events as Array<Record<string, unknown>> : [];
    const snapshot = category ? snapshotEvents.filter((event) => event.type === category).length : snapshotEvents.length;
    const apiConsumable = snapshotRow ? snapshot : normalized; const uiConsumable = apiConsumable;
    if (snapshotRow && snapshot !== normalized) base.warnings.push(`DB_SNAPSHOT_MISMATCH:${normalized}:${snapshot}`);
    return { ...base, source: sources, counts: { raw, normalized, database: normalized, snapshot, apiConsumable, uiConsumable } };
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
