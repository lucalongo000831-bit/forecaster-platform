import "server-only";

import { desc, eq } from "drizzle-orm";
import {
  economicReleaseEvents, economicSeries, getDatabase, ingestionJobs, ingestionRuns, isDatabaseConfigured,
  newsEntities, newsItems, normalizedEconomicObservations, positioningObservations, providerWatermarks,
} from "@/db";
import { structuredLog } from "@/lib/server/logger";
import { blsAdapter, cftcAdapter, fredAdapter, marketauxAdapter, numericValue } from "@/providers/data-v2";
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

async function beginRun(name: string, dataset: string, provider: string | null, schedule: string | null) {
  const jobId = await ensureJob(name, dataset, provider, schedule); if (!isDatabaseConfigured()) return null;
  const [run] = await getDatabase().insert(ingestionRuns).values({ jobId, jobName: name, provider, status: "RUNNING" }).returning({ id: ingestionRuns.id });
  return run?.id ?? null;
}

async function finishRun(runId: string | null, status: IngestionStatus, counts: { fetched?: number; inserted?: number; skipped?: number; errors?: number }, metadata: Record<string, unknown> = {}) {
  if (!runId || !isDatabaseConfigured()) return;
  await getDatabase().update(ingestionRuns).set({ status, endedAt: new Date(), recordsFetched: counts.fetched ?? 0, recordsInserted: counts.inserted ?? 0, recordsSkipped: counts.skipped ?? 0, errors: counts.errors ?? 0, metadata }).where(eq(ingestionRuns.id, runId));
}

async function watermark(provider: string, dataset: string, success: boolean, externalTimestamp?: string | null, metadata: Record<string, unknown> = {}) {
  if (!isDatabaseConfigured()) return;
  await getDatabase().insert(providerWatermarks).values({ provider, dataset, lastAttempt: new Date(), lastSuccessfulSync: success ? new Date() : null, lastExternalTimestamp: externalTimestamp ? new Date(externalTimestamp) : null, metadata })
    .onConflictDoUpdate({ target: [providerWatermarks.provider, providerWatermarks.dataset], set: { lastAttempt: new Date(), ...(success ? { lastSuccessfulSync: new Date(), lastExternalTimestamp: externalTimestamp ? new Date(externalTimestamp) : null } : {}), metadata, updatedAt: new Date() } });
}

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
        const result = await fredAdapter.observations(definition.externalId, options.start ?? new Date(Date.now() - 400 * 86_400_000).toISOString().slice(0, 10));
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

export async function ingestFredReleaseCalendar(from: string, to: string) {
  const runId = await beginRun("fred-release-calendar", "economic_release_events", "fred", "15 */6 * * *"); let inserted = 0;
  try {
    if (!isDatabaseConfigured()) return { status: "SKIPPED" as const, inserted };
    const rows: Array<{ release_id: number; release_name: string; date: string }> = [];
    let offset = 0; let totalAvailable = 0;
    do {
      const result = await fredAdapter.releaseDates(from, to, offset); totalAvailable = result.data.count;
      rows.push(...result.data.release_dates.filter((release) => release.date >= from && release.date <= to));
      const oldestDate = result.data.release_dates.at(-1)?.date;
      offset += result.data.release_dates.length;
      if (!result.data.release_dates.length || (oldestDate && oldestDate < from)) break;
    } while (offset < totalAvailable && offset < 10_000);
    await persistRawProviderRecord({ provider: "fred", dataset: "economic_release_dates", entityKey: `${from}:${to}`, payload: { from, to, totalAvailable, rows }, schemaVersion: "fred-release-dates-v2" });
    const eventRows = rows.map((release) => ({ provider: "fred", sourceId: `${release.release_id}:${release.date}`, title: release.release_name, country: "US", importance: "HIGH" as const, scheduledAt: new Date(`${release.date}T13:30:00Z`), status: "AVAILABLE" as const, metadata: { releaseId: release.release_id, timePrecision: "DATE_WITH_DEFAULT_TIME" } }));
    for (const batch of chunksOf(eventRows)) {
      const stored = await getDatabase().insert(economicReleaseEvents).values(batch).onConflictDoNothing({ target: [economicReleaseEvents.provider, economicReleaseEvents.sourceId] }).returning({ id: economicReleaseEvents.id });
      inserted += stored.length;
    }
    await watermark("fred", "economic_release_events", true, rows.at(-1)?.date ?? null, { from, to }); await finishRun(runId, "COMPLETED", { fetched: rows.length, inserted }); return { status: "COMPLETED" as const, fetched: rows.length, inserted };
  } catch (error) { await watermark("fred", "economic_release_events", false); await finishRun(runId, "FAILED", { errors: 1 }); throw error; }
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
  const now = new Date(); const from = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)).toISOString().slice(0, 10); const to = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 3, 0)).toISOString().slice(0, 10);
  const [fred, calendar, cftc, news] = await Promise.allSettled([ingestFredEconomicData(), ingestFredReleaseCalendar(from, to), ingestCftcPositioning(), ingestMarketauxNews()]);
  return { status: "COMPLETED" as const, fred: fred.status, calendar: calendar.status, cftc: cftc.status, news: news.status };
}

export async function latestIngestionRuns(limit = 50) {
  if (!isDatabaseConfigured()) return [];
  return getDatabase().select().from(ingestionRuns).orderBy(desc(ingestionRuns.startedAt)).limit(Math.min(Math.max(limit, 1), 200));
}
