import "server-only";

import { desc, eq } from "drizzle-orm";
import {
  economicReleaseEvents, economicSeries, getDatabase, ingestionJobs, ingestionRuns, isDatabaseConfigured,
  newsEntities, newsItems, normalizedEconomicObservations, positioningObservations, providerWatermarks,
} from "@/db";
import { structuredLog } from "@/lib/server/logger";
import { blsAdapter, cftcAdapter, eiaAdapter, fredAdapter, fredCoreMacroReleases, marketauxAdapter, numericValue, officialCentralBankCalendarAdapter, parseEcbMeetings, parseFederalReserveMeetings } from "@/providers/data-v2";
import { ProviderGatewayError } from "@/providers/gateway-v2";
import { economicSeriesRegistry, seriesByProvider, type EconomicSeriesDefinition } from "@/providers/data-v2/series-registry";
import { persistRawProviderRecord, publishDatasetSnapshot } from "./snapshot-repository";

type IngestionStatus = "COMPLETED" | "PARTIAL" | "FAILED" | "SKIPPED";
const databaseBatchSize = 500;

function chunksOf<T>(rows: T[], size = databaseBatchSize) {
  const chunks: T[][] = [];
  for (let index = 0; index < rows.length; index += size) chunks.push(rows.slice(index, index + size));
  return chunks;
}

async function ensureJob(name: string, dataset: string, provider: string | null, schedule: string | null) {
  if (!isDatabaseConfigured()) return null;
  const [row] = await getDatabase().insert(ingestionJobs).values({ name, dataset, provider, schedule, priority: "BACKGROUND" })
    .onConflictDoUpdate({ target: ingestionJobs.name, set: { dataset, provider, schedule, updatedAt: new Date() } }).returning({ id: ingestionJobs.id });
  return row?.id ?? null;
}

export async function beginIngestionRun(name: string, dataset: string, provider: string | null, schedule: string | null) {
  const jobId = await ensureJob(name, dataset, provider, schedule); if (!isDatabaseConfigured()) return null;
  const [run] = await getDatabase().insert(ingestionRuns).values({ jobId, jobName: name, provider, status: "RUNNING" }).returning({ id: ingestionRuns.id });
  return run?.id ?? null;
}

export async function finishIngestionRun(runId: string | null, status: IngestionStatus, counts: { fetched?: number; inserted?: number; updated?: number; skipped?: number; errors?: number }, metadata: Record<string, unknown> = {}) {
  if (!runId || !isDatabaseConfigured()) return;
  const runWatermark = metadata.watermark && typeof metadata.watermark === "object" ? metadata.watermark as Record<string, unknown> : {};
  await getDatabase().update(ingestionRuns).set({ status, endedAt: new Date(), recordsFetched: counts.fetched ?? 0, recordsInserted: counts.inserted ?? 0, recordsUpdated: counts.updated ?? 0, recordsSkipped: counts.skipped ?? 0, errors: counts.errors ?? 0, watermark: runWatermark, metadata }).where(eq(ingestionRuns.id, runId));
}

const beginRun = beginIngestionRun;
const finishRun = finishIngestionRun;

export async function recordProviderWatermark(provider: string, dataset: string, success: boolean, externalTimestamp?: string | null, metadata: Record<string, unknown> = {}, cursor?: string | null) {
  if (!isDatabaseConfigured()) return;
  await getDatabase().insert(providerWatermarks).values({ provider, dataset, lastAttempt: new Date(), lastSuccessfulSync: success ? new Date() : null, lastExternalTimestamp: externalTimestamp ? new Date(externalTimestamp) : null, cursor, metadata })
    .onConflictDoUpdate({ target: [providerWatermarks.provider, providerWatermarks.dataset], set: { lastAttempt: new Date(), ...(success ? { lastSuccessfulSync: new Date(), lastExternalTimestamp: externalTimestamp ? new Date(externalTimestamp) : null, metadata } : {}), cursor, updatedAt: new Date() } });
}
const watermark = recordProviderWatermark;

async function upsertSeries(definition: EconomicSeriesDefinition) {
  const [row] = await getDatabase().insert(economicSeries).values({ internalKey: definition.key, provider: definition.provider, externalSeriesId: definition.externalId, country: definition.country, category: definition.category, frequency: definition.frequency, unit: definition.unit, importance: definition.importance, transform: definition.transform, metadata: { title: definition.title } })
    .onConflictDoUpdate({ target: economicSeries.internalKey, set: { externalSeriesId: definition.externalId, frequency: definition.frequency, unit: definition.unit, importance: definition.importance, transform: definition.transform, metadata: { title: definition.title }, updatedAt: new Date() } }).returning({ id: economicSeries.id });
  return row!.id;
}

export async function ingestFredEconomicData(options: { start?: string; seriesKeys?: string[] } = {}) {
  const runId = await beginRun("fred-economic-observations", "economic_observations", "fred", "0 */6 * * *");
  const fredDefinitions = seriesByProvider("fred").filter((item) => !options.seriesKeys?.length || options.seriesKeys.includes(item.key));
  const blsDefinitions = seriesByProvider("bls").filter((item) => !options.seriesKeys?.length || options.seriesKeys.includes(item.key));
  const definitions = [...fredDefinitions, ...blsDefinitions];
  let fetched = 0; let inserted = 0; let successfulSeries = 0; let latest: string | null = null;
  let fredSuccessful = 0; let blsSuccessful = 0;
  try {
    if (!isDatabaseConfigured()) return { status: "SKIPPED" as const, reason: "database-not-configured", fetched, inserted };
    for (const definition of fredDefinitions) {
      try {
        const result = await fredAdapter.observations(definition.externalId, options.start ?? new Date(Date.now() - 800 * 86_400_000).toISOString().slice(0, 10));
        const seriesId = await upsertSeries(definition); fetched += result.data.observations.length;
        await persistRawProviderRecord({ provider: "fred", dataset: "economic_observations", externalId: definition.externalId, entityKey: definition.key, payload: result.data as unknown as Record<string, unknown>, schemaVersion: "fred-observations-v1" });
        const observationRows = result.data.observations.flatMap((observation) => {
          const value = numericValue(observation.value); const observedAt = new Date(`${observation.date}T00:00:00Z`); if (Number.isNaN(observedAt.getTime())) return [];
          const availableAt = observation.realtime_start ? new Date(`${observation.realtime_start}T00:00:00Z`) : observedAt;
          if (!latest || observation.date > latest) latest = observation.date;
          return [{ seriesId, value: value === null ? null : String(value), observedAt, effectiveAt: observedAt, availableAt, status: value === null ? "INSUFFICIENT_DATA" as const : "AVAILABLE" as const, provider: "fred", schemaVersion: "economic-observation-v1", metadata: { realtimeStart: observation.realtime_start, realtimeEnd: observation.realtime_end } }];
        });
        for (const batch of chunksOf(observationRows)) {
          const stored = await getDatabase().insert(normalizedEconomicObservations).values(batch).onConflictDoNothing({ target: [normalizedEconomicObservations.seriesId, normalizedEconomicObservations.observedAt, normalizedEconomicObservations.availableAt, normalizedEconomicObservations.provider] }).returning({ id: normalizedEconomicObservations.id });
          inserted += stored.length;
        }
        successfulSeries += 1; fredSuccessful += 1;
      } catch (error) {
        structuredLog("warn", "ingestion.fred.series_failed", { series: definition.key, code: error instanceof ProviderGatewayError ? error.errorClass : error instanceof Error ? error.name : "UNKNOWN" });
        if (error instanceof ProviderGatewayError && ["TIMEOUT", "AUTH_ERROR", "RATE_LIMIT", "UPSTREAM_5XX"].includes(error.errorClass)) break;
      }
    }
    if (blsDefinitions.length) {
      try {
        const currentYear = new Date().getUTCFullYear();
        const result = await blsAdapter.series(blsDefinitions.map((item) => item.externalId), currentYear - 2, currentYear);
        await persistRawProviderRecord({ provider: "bls", dataset: "economic_observations", entityKey: blsDefinitions.map((item) => item.key).join(":"), payload: result.data as unknown as Record<string, unknown>, schemaVersion: "bls-timeseries-v2" });
        const availableAt = new Date(`${new Date().toISOString().slice(0, 10)}T00:00:00Z`);
        for (const providerSeries of result.data.Results.series) {
          const definition = blsDefinitions.find((item) => item.externalId === providerSeries.seriesID); if (!definition) continue;
          const seriesId = await upsertSeries(definition);
          const observationRows = providerSeries.data.flatMap((observation) => {
            const month = /^M(0[1-9]|1[0-2])$/.exec(observation.period)?.[1]; const value = numericValue(observation.value); if (!month) return [];
            const observedAt = new Date(`${observation.year}-${month}-01T00:00:00Z`); if (Number.isNaN(observedAt.getTime())) return [];
            const observedDate = observedAt.toISOString().slice(0, 10); if (!latest || observedDate > latest) latest = observedDate;
            return [{ seriesId, value: value === null ? null : String(value), observedAt, effectiveAt: observedAt, availableAt, status: value === null ? "INSUFFICIENT_DATA" as const : "AVAILABLE" as const, provider: "bls", schemaVersion: "economic-observation-v2", metadata: { periodName: observation.periodName, footnotes: observation.footnotes ?? [] } }];
          });
          fetched += observationRows.length;
          for (const batch of chunksOf(observationRows)) {
            const stored = await getDatabase().insert(normalizedEconomicObservations).values(batch).onConflictDoNothing({ target: [normalizedEconomicObservations.seriesId, normalizedEconomicObservations.observedAt, normalizedEconomicObservations.availableAt, normalizedEconomicObservations.provider] }).returning({ id: normalizedEconomicObservations.id });
            inserted += stored.length;
          }
          successfulSeries += 1; blsSuccessful += 1;
        }
      } catch (error) {
        structuredLog("warn", "ingestion.bls.series_failed", { code: error instanceof ProviderGatewayError ? error.errorClass : error instanceof Error ? error.name : "UNKNOWN" });
      }
    }
    const errors = Math.max(0, definitions.length - successfulSeries); const sourceSucceeded = successfulSeries > 0;
    await Promise.all([watermark("fred", "economic_observations", fredSuccessful > 0, latest, { series: fredDefinitions.length, successful: fredSuccessful }), watermark("bls", "economic_observations", blsSuccessful > 0, latest, { series: blsDefinitions.length, successful: blsSuccessful })]);
    await publishDatasetSnapshot({ dataset: "economic_observations", payload: { providers: [fredSuccessful ? "fred" : null, blsSuccessful ? "bls" : null].filter(Boolean), series: definitions.map((item) => item.key), latest }, recordCount: fetched, coverage: definitions.length ? successfulSeries / definitions.length * 100 : null, sourceSucceeded, schemaValid: true, allowVerifiedEmpty: false, sourceTimestamp: latest, expiresAt: new Date(Date.now() + 48 * 3_600_000).toISOString(), freshness: errors ? "CACHED" : "FRESH", schemaVersion: "economic-snapshot-v2" });
    const status: IngestionStatus = errors ? sourceSucceeded ? "PARTIAL" : "FAILED" : "COMPLETED"; await finishRun(runId, status, { fetched, inserted, errors }, { latest, series: definitions.length, successfulSeries, fredSuccessful, blsSuccessful });
    return { status, fetched, inserted, errors, latest };
  } catch (error) { await finishRun(runId, "FAILED", { fetched, inserted, errors: Math.max(1, definitions.length - successfulSeries) }); throw error; }
}

function eiaPeriod(value: unknown) { if (typeof value !== "string") return null; const date = /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : /^\d{4}-\d{2}$/.test(value) ? `${value}-01` : null; return date ? new Date(`${date}T00:00:00Z`) : null; }

export async function ingestEiaEnergyData(options: { start?: string } = {}) {
  const runId = await beginRun("eia-energy-observations", "energy_observations", "eia", "45 */6 * * *"); const definitions = seriesByProvider("eia"); let fetched = 0; let inserted = 0; let successfulSeries = 0; let latest: string | null = null;
  try {
    if (!isDatabaseConfigured()) return { status: "SKIPPED" as const, reason: "database-not-configured", fetched, inserted };
    for (const definition of definitions) {
      try {
        const result = await eiaAdapter.series(definition.externalId, { length: "500", "data[0]": "value", frequency: "weekly", "sort[0][column]": "period", "sort[0][direction]": "desc", ...(options.start ? { start: options.start } : {}) }); const seriesId = await upsertSeries(definition); const rows = result.data.response.data; fetched += rows.length;
        await persistRawProviderRecord({ provider: "eia", dataset: "energy_observations", externalId: definition.externalId, entityKey: definition.key, payload: result.data as unknown as Record<string, unknown>, schemaVersion: "eia-energy-v2" });
        const observationRows = rows.flatMap((row) => { const observedAt = eiaPeriod(row.period); const value = numericValue(row.value); if (!observedAt) return []; const date = observedAt.toISOString().slice(0, 10); if (!latest || date > latest) latest = date; return [{ seriesId, value: value === null ? null : String(value), observedAt, effectiveAt: observedAt, availableAt: observedAt, status: value === null ? "INSUFFICIENT_DATA" as const : "AVAILABLE" as const, provider: "eia", schemaVersion: "energy-observation-v2", metadata: { unit: row["value-units"] ?? definition.unit, sourceRoute: definition.externalId } }]; });
        for (const batch of chunksOf(observationRows)) { const stored = await getDatabase().insert(normalizedEconomicObservations).values(batch).onConflictDoNothing({ target: [normalizedEconomicObservations.seriesId, normalizedEconomicObservations.observedAt, normalizedEconomicObservations.availableAt, normalizedEconomicObservations.provider] }).returning({ id: normalizedEconomicObservations.id }); inserted += stored.length; }
        successfulSeries += 1;
      } catch (error) { structuredLog("warn", "ingestion.eia.series_failed", { series: definition.key, code: error instanceof ProviderGatewayError ? error.errorClass : error instanceof Error ? error.name : "UNKNOWN" }); }
    }
    const errors = definitions.length - successfulSeries; const sourceSucceeded = successfulSeries > 0; const status: IngestionStatus = errors ? sourceSucceeded ? "PARTIAL" : "FAILED" : "COMPLETED";
    await watermark("eia", "energy_observations", sourceSucceeded, latest, { series: definitions.length, successful: successfulSeries }); await publishDatasetSnapshot({ dataset: "energy_observations", payload: { provider: "eia", series: definitions.map((item) => item.key), latest } as Record<string, unknown>, recordCount: fetched, coverage: definitions.length ? successfulSeries / definitions.length * 100 : null, sourceSucceeded, schemaValid: true, allowVerifiedEmpty: false, sourceTimestamp: latest, expiresAt: new Date(Date.now() + 48 * 3_600_000).toISOString(), freshness: errors ? "CACHED" : "FRESH", schemaVersion: "energy-snapshot-v2" }); await finishRun(runId, status, { fetched, inserted, errors }); return { status, fetched, inserted, errors, latest };
  } catch (error) { await finishRun(runId, "FAILED", { fetched, inserted, errors: Math.max(1, definitions.length - successfulSeries) }); throw error; }
}

export async function ingestFredReleaseCalendar(from: string, to: string) {
  const runId = await beginRun("fred-release-calendar", "economic_release_events", "fred", "15 */6 * * *"); let inserted = 0;
  try {
    if (!isDatabaseConfigured()) return { status: "SKIPPED" as const, inserted };
    const settled = await Promise.allSettled(fredCoreMacroReleases.map(async (release) => {
      const result = await fredAdapter.releaseDates(release.id, from, to);
      return result.data.release_dates.filter((item) => item.date >= from && item.date <= to).map((item) => ({ ...item, release_name: release.name }));
    }));
    const errors = settled.filter((result) => result.status === "rejected").length;
    const rows = [...new Map(settled.flatMap((result) => result.status === "fulfilled" ? result.value : []).map((release) => [`${release.release_id}:${release.date}`, release])).values()]
      .sort((left, right) => left.date.localeCompare(right.date) || left.release_id - right.release_id);
    const successfulReleases = fredCoreMacroReleases.length - errors;
    if (!successfulReleases) throw new ProviderGatewayError("UPSTREAM_5XX", "FRED core release calendar unavailable", true, 503);
    await persistRawProviderRecord({ provider: "fred", dataset: "economic_release_dates", entityKey: `${from}:${to}`, payload: { from, to, coreReleases: fredCoreMacroReleases, successfulReleases, rows }, schemaVersion: "fred-release-dates-v3" });
    const eventRows = rows.map((release) => ({ provider: "fred", sourceId: `${release.release_id}:${release.date}`, title: release.release_name, country: "US", importance: "HIGH" as const, scheduledAt: new Date(`${release.date}T13:30:00Z`), status: "AVAILABLE" as const, metadata: { releaseId: release.release_id, timePrecision: "DATE_WITH_DEFAULT_TIME" } }));
    for (const batch of chunksOf(eventRows)) {
      const stored = await getDatabase().insert(economicReleaseEvents).values(batch).onConflictDoNothing({ target: [economicReleaseEvents.provider, economicReleaseEvents.sourceId] }).returning({ id: economicReleaseEvents.id });
      inserted += stored.length;
    }
    const status: IngestionStatus = errors ? "PARTIAL" : "COMPLETED";
    await watermark("fred", "economic_release_events", true, rows.at(-1)?.date ?? null, { from, to, coreReleases: fredCoreMacroReleases.length, successfulReleases, records: rows.length });
    await finishRun(runId, status, { fetched: rows.length, inserted, skipped: Math.max(0, rows.length - inserted), errors }, { from, to, successfulReleases, watermark: { latestReleaseDate: rows.at(-1)?.date ?? null } });
    return { status, fetched: rows.length, inserted, skipped: Math.max(0, rows.length - inserted), errors };
  } catch (error) { await watermark("fred", "economic_release_events", false); await finishRun(runId, "FAILED", { errors: 1 }); throw error; }
}

export async function ingestCentralBankCalendar(from: string, to: string) {
  const runId = await beginRun("official-central-bank-calendar", "central_bank_calendar", null, "25 6 * * *");
  let fetched = 0; let inserted = 0; let skipped = 0; let errors = 0;
  const sourceResults: Record<string, string> = {};
  try {
    if (!isDatabaseConfigured()) return { status: "SKIPPED" as const, reason: "database-not-configured", fetched, inserted, skipped, errors };
    const settled = await Promise.allSettled([officialCentralBankCalendarAdapter.federalReserve(), officialCentralBankCalendarAdapter.ecb()]);
    const documentCounts: Record<string, number> = {};
    const candidates = settled.flatMap((result, index) => {
      const provider = index === 0 ? "federal-reserve" : "ecb";
      if (result.status === "rejected") { sourceResults[provider] = "FAILED"; errors += 1; return []; }
      const sourceUrl = index === 0 ? "https://www.federalreserve.gov/monetarypolicy/fomccalendars.htm" : "https://www.ecb.europa.eu/press/calendars/mgcgc/html/index.en.html";
      const meetings = index === 0 ? parseFederalReserveMeetings(result.value.data, sourceUrl) : parseEcbMeetings(result.value.data, sourceUrl);
      documentCounts[provider] = meetings.length;
      if (!meetings.length) { sourceResults[provider] = "SCHEMA_INVALID"; errors += 1; return []; }
      sourceResults[provider] = result.value.status;
      return meetings.filter((meeting) => meeting.decisionDate >= from && meeting.decisionDate <= to);
    });
    fetched = candidates.length;
    for (const provider of ["federal-reserve", "ecb"] as const) {
      const meetings = candidates.filter((meeting) => meeting.centralBank === (provider === "ecb" ? "ECB" : "FEDERAL_RESERVE"));
      if (sourceResults[provider]) await persistRawProviderRecord({ provider, dataset: "central_bank_calendar", entityKey: `${from}:${to}`, payload: { from, to, meetings, documentRecords: documentCounts[provider] ?? 0 }, sourceUrl: meetings[0]?.sourceUrl ?? (provider === "ecb" ? "https://www.ecb.europa.eu/press/calendars/mgcgc/html/index.en.html" : "https://www.federalreserve.gov/monetarypolicy/fomccalendars.htm"), schemaVersion: "central-bank-calendar-v1" });
      const validDocument = (documentCounts[provider] ?? 0) > 0;
      await watermark(provider, "central_bank_calendar", validDocument, meetings.at(-1)?.decisionDate ?? null, { from, to, records: meetings.length, documentRecords: documentCounts[provider] ?? 0, sourceStatus: sourceResults[provider] ?? "FAILED" });
    }
    const rows = candidates.map((meeting) => ({
      provider: meeting.centralBank === "ECB" ? "ecb" : "federal-reserve",
      sourceId: `${meeting.centralBank}:${meeting.decisionDate}`,
      title: meeting.title,
      country: meeting.country,
      importance: "HIGH" as const,
      scheduledAt: new Date(meeting.decisionTime ?? `${meeting.decisionDate}T00:00:00Z`),
      publishedAt: meeting.publishedAt && !Number.isNaN(Date.parse(meeting.publishedAt)) ? new Date(meeting.publishedAt) : null,
      status: "AVAILABLE" as const,
      metadata: { ...meeting, releaseStatus: "PENDING", currentPolicyRate: null, previousRate: null, actualRate: null },
    }));
    for (const batch of chunksOf(rows)) {
      const stored = await getDatabase().insert(economicReleaseEvents).values(batch).onConflictDoNothing({ target: [economicReleaseEvents.provider, economicReleaseEvents.sourceId] }).returning({ id: economicReleaseEvents.id });
      inserted += stored.length;
    }
    skipped = Math.max(0, fetched - inserted);
    const sourceSucceeded = Object.values(documentCounts).some((count) => count > 0);
    const status: IngestionStatus = errors ? sourceSucceeded ? "PARTIAL" : "FAILED" : "COMPLETED";
    const schemaValid = sourceSucceeded;
    await publishDatasetSnapshot({ dataset: "central_bank_calendar", entityKey: `${from}:${to}`, payload: { from, to, records: candidates, sourceResults, documentCounts }, recordCount: fetched, coverage: Object.values(documentCounts).filter((count) => count > 0).length / 2 * 100, sourceSucceeded, schemaValid, allowVerifiedEmpty: true, sourceTimestamp: candidates.map((item) => item.publishedAt ?? item.decisionDate).sort().at(-1) ?? null, expiresAt: new Date(Date.now() + 7 * 86_400_000).toISOString(), freshness: errors ? "CACHED" : "FRESH", schemaVersion: "central-bank-calendar-v1" });
    await finishRun(runId, status, { fetched, inserted, skipped, errors }, { from, to, sourceResults, watermark: { latestDecisionDate: candidates.at(-1)?.decisionDate ?? null } });
    return { status, fetched, inserted, skipped, errors, sourceResults };
  } catch (error) {
    await finishRun(runId, "FAILED", { fetched, inserted, skipped, errors: Math.max(1, errors) }, { from, to });
    throw error;
  }
}

function valueOf(row: Record<string, unknown>, ...keys: string[]) { for (const key of keys) { const value = numericValue(row[key]); if (value !== null) return value; } return null; }
function textOf(row: Record<string, unknown>, ...keys: string[]) { for (const key of keys) if (typeof row[key] === "string" && row[key]) return row[key] as string; return null; }

export async function ingestCftcPositioning() {
  const runId = await beginRun("cftc-positioning", "positioning", "cftc", "0 22 * * 5"); let fetched = 0; let inserted = 0; let errors = 0; let latest: string | null = null;
  try {
    if (!isDatabaseConfigured()) return { status: "SKIPPED" as const, fetched, inserted };
    for (const dataset of ["disaggregatedFuturesOnly", "tradersInFinancialFuturesOnly"] as const) {
      try {
        const result = await cftcAdapter.latest(dataset, 1_000); fetched += result.data.length;
        await persistRawProviderRecord({ provider: "cftc", dataset: "positioning", entityKey: dataset, payload: { rows: result.data }, schemaVersion: "cftc-cot-v1" });
        const positioningRows = result.data.flatMap((row) => {
          const reportDate = textOf(row, "report_date_as_yyyy_mm_dd", "report_date"); const contract = textOf(row, "contract_market_name", "market_and_exchange_names", "commodity_name"); if (!reportDate || !contract) return [];
          if (!latest || reportDate > latest) latest = reportDate;
          const long = valueOf(row, "m_money_positions_long_all", "asset_mgr_positions_long_all", "noncomm_positions_long_all"); const short = valueOf(row, "m_money_positions_short_all", "asset_mgr_positions_short_all", "noncomm_positions_short_all"); const category = dataset === "disaggregatedFuturesOnly" ? "MANAGED_MONEY" : "ASSET_MANAGER"; const sourceId = `${dataset}:${textOf(row, "cftc_contract_market_code") ?? contract}:${reportDate}:${category}`;
          const reportTimestamp = new Date(reportDate); if (Number.isNaN(reportTimestamp.getTime())) return [];
          return [{ market: textOf(row, "market_and_exchange_names", "contract_market_name") ?? contract, contract, category, long: long === null ? null : String(long), short: short === null ? null : String(short), spreading: valueOf(row, "m_money_positions_spread_all")?.toString() ?? null, net: long !== null && short !== null ? String(long - short) : null, openInterest: valueOf(row, "open_interest_all")?.toString() ?? null, reportDate: reportTimestamp, publishedAt: new Date(reportTimestamp.getTime() + 3 * 86_400_000), availableAt: new Date(reportTimestamp.getTime() + 3 * 86_400_000), source: "cftc", sourceId, metadata: { dataset } }];
        });
        for (const batch of chunksOf(positioningRows)) {
          const stored = await getDatabase().insert(positioningObservations).values(batch).onConflictDoNothing({ target: [positioningObservations.source, positioningObservations.sourceId] }).returning({ id: positioningObservations.id }); inserted += stored.length;
        }
      } catch { errors += 1; }
    }
    const sourceSucceeded = errors < 2; const status: IngestionStatus = errors === 0 ? "COMPLETED" : sourceSucceeded ? "PARTIAL" : "FAILED";
    await watermark("cftc", "positioning", sourceSucceeded, latest, { errors });
    await publishDatasetSnapshot({ dataset: "positioning", payload: { provider: "cftc", datasets: ["disaggregatedFuturesOnly", "tradersInFinancialFuturesOnly"], latest }, recordCount: fetched, coverage: (2 - errors) / 2 * 100, sourceSucceeded, schemaValid: true, allowVerifiedEmpty: false, sourceTimestamp: latest, expiresAt: new Date(Date.now() + 9 * 86_400_000).toISOString(), freshness: errors ? "CACHED" : "FRESH", schemaVersion: "cftc-positioning-v2" });
    await finishRun(runId, status, { fetched, inserted, errors }); return { status, fetched, inserted, errors, latest };
  } catch (error) { await finishRun(runId, "FAILED", { fetched, inserted, errors: errors + 1 }); throw error; }
}

function canonicalNewsUrl(value: string) { const url = new URL(value); url.hash = ""; for (const key of [...url.searchParams.keys()]) if (/^(utm_|ref|source)/i.test(key)) url.searchParams.delete(key); return url.toString(); }

export async function ingestMarketauxNews() {
  const runId = await beginRun("marketaux-global-news", "news", "marketaux", "*/15 * * * *");
  try {
    if (!isDatabaseConfigured()) return { status: "SKIPPED" as const, fetched: 0, inserted: 0 };
    const result = await marketauxAdapter.news({ industries: ["Financial Services", "Energy", "Technology"], limit: 100 }); let inserted = 0;
    await persistRawProviderRecord({ provider: "marketaux", dataset: "news", entityKey: "global", payload: result.data as unknown as Record<string, unknown>, schemaVersion: "marketaux-news-v1" });
    for (const article of result.data.data) {
      const sentiments = article.entities.map((entity) => entity.sentiment_score).filter((value): value is number => typeof value === "number"); const sentiment = sentiments.length ? sentiments.reduce((sum, value) => sum + value, 0) / sentiments.length : null;
      const [stored] = await getDatabase().insert(newsItems).values({ canonicalUrl: canonicalNewsUrl(article.url), normalizedTitle: article.title.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim(), title: article.title, publisher: article.source, publishedAt: new Date(article.published_at), summary: article.description ?? article.snippet ?? null, sentiment: sentiment === null ? null : String(sentiment), classification: { language: article.language, providerId: article.uuid }, provider: "marketaux", sourceTimestamp: new Date(article.published_at), fetchedAt: new Date(), quality: "PARTIAL" }).onConflictDoNothing({ target: newsItems.canonicalUrl }).returning({ id: newsItems.id });
      if (!stored) continue; inserted += 1;
      const entities: Array<{ entityType: string; value: string }> = [];
      for (const entity of article.entities) {
        if (entity.symbol) entities.push({ entityType: "SYMBOL", value: entity.symbol });
        if (entity.name) entities.push({ entityType: "ORGANIZATION", value: entity.name });
        if (entity.industry) entities.push({ entityType: "INDUSTRY", value: entity.industry });
      }
      if (entities.length) await getDatabase().insert(newsEntities).values(entities.map((entity) => ({ newsItemId: stored.id, ...entity, confidence: null })));
    }
    const latest = result.data.data.map((item) => item.published_at).sort().at(-1) ?? null;
    await watermark("marketaux", "news", true, latest);
    await publishDatasetSnapshot({ dataset: "news", payload: { provider: "marketaux", latest, fetched: result.data.data.length }, recordCount: result.data.data.length, coverage: result.data.data.length ? 100 : null, sourceSucceeded: true, schemaValid: true, allowVerifiedEmpty: false, sourceTimestamp: latest, expiresAt: new Date(Date.now() + 2 * 3_600_000).toISOString(), freshness: "FRESH", schemaVersion: "marketaux-news-v2" });
    await finishRun(runId, "COMPLETED", { fetched: result.data.data.length, inserted }); return { status: "COMPLETED" as const, fetched: result.data.data.length, inserted, latest };
  } catch (error) { await watermark("marketaux", "news", false); await finishRun(runId, "FAILED", { errors: 1 }); throw error; }
}

export async function bootstrapDataArchitectureV2() {
  if (!isDatabaseConfigured()) return { status: "SKIPPED" as const, reason: "database-not-configured" };
  for (const definition of economicSeriesRegistry) await upsertSeries(definition);
  const now = new Date(); const from = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 1)).toISOString().slice(0, 10); const to = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 3, 0)).toISOString().slice(0, 10);
  const [fred, calendar, centralBank, energy, cftc, news] = await Promise.allSettled([ingestFredEconomicData(), ingestFredReleaseCalendar(from, to), ingestCentralBankCalendar(from, to), ingestEiaEnergyData(), ingestCftcPositioning(), ingestMarketauxNews()]);
  return { status: "COMPLETED" as const, fred: fred.status, calendar: calendar.status, centralBank: centralBank.status, energy: energy.status, cftc: cftc.status, news: news.status };
}

export async function latestIngestionRuns(limit = 50) {
  if (!isDatabaseConfigured()) return [];
  return getDatabase().select().from(ingestionRuns).orderBy(desc(ingestionRuns.startedAt)).limit(Math.min(Math.max(limit, 1), 200));
}
