import "server-only";

import { deduplicatePoliticalTransactions } from "@/engines/political";
import { structuredLog } from "@/lib/server/logger";
import { persistPoliticalTransactions } from "./political-repository";
import { publishDatasetSnapshot } from "@/services/data-v2/snapshot-repository";
import { beginIngestionRun, finishIngestionRun, recordProviderWatermark } from "@/services/data-v2/ingestion-service";
import { getPoliticalSyncHealth } from "./political-repository";
import { FmpPoliticalAdapter } from "@/providers/political/fmp-adapter";
import { normalizePoliticalRows } from "./political-data-router";
import { eq } from "drizzle-orm";
import { getDatabase, isDatabaseConfigured, politicalTransactions, providerWatermarks } from "@/db";
import { advancePoliticalBackfill, initialPoliticalBackfillPage } from "./political-backfill";
import { politicalSourceRouter, type PoliticalHistoricalSource } from "./political-source-router";
import { calculatePoliticalHistoryMonths } from "./political-history-coverage";
import { persistPoliticalHistoryMonths } from "./political-repository";
import type { ResolvedInstrument } from "@/types";

export async function syncPoliticalDisclosures(options: { limit?: number } = {}) {
  const runId = await beginIngestionRun("political-source-router-recent", "political_disclosures", null, "30 6 * * *");
  const limit = Math.min(500, Math.max(20, options.limit ?? 100));
  try {
  const to = new Date().toISOString().slice(0, 10); const from = new Date(Date.now() - 14 * 86_400_000).toISOString().slice(0, 10);
  const routed = await politicalSourceRouter.recent({ from, to, limit });
  if (!routed.operational) throw new Error("POLITICAL_OPERATIONAL_SOURCES_UNAVAILABLE");
  const normalized = await normalizePoliticalRows(routed.rows, routed.fetchedAt); const deduped = deduplicatePoliticalTransactions(normalized.transactions); const byId = new Map(normalized.politicians.map((item) => [item.id, item]));
  const persistence = await persistPoliticalTransactions({ transactions: deduped.data, sourceTransactions: deduped.sourceRows, politicians: [...byId.values()], houseRecords: deduped.data.filter((row) => row.chamber === "HOUSE").length, senateRecords: deduped.data.filter((row) => row.chamber === "SENATE").length, duplicatesRemoved: deduped.duplicatesRemoved + normalized.duplicatesRemoved }).catch((error) => { structuredLog("warn", "political.ingestion.persistence_failed", { code: error instanceof Error ? error.name : "UNKNOWN" }); return { persisted: false, transactions: 0, mapped: deduped.data.filter((row) => row.resolutionStatus === "RESOLVED").length, unresolved: deduped.data.filter((row) => row.resolutionStatus === "UNRESOLVED_ASSET").length }; });
  const result = { status: routed.degraded ? "SUCCESS_DEGRADED" as const : "SUCCESS" as const, fetched: routed.rows.length, normalized: deduped.data.length, duplicatesRemoved: deduped.duplicatesRemoved, house: deduped.data.filter((row) => row.chamber === "HOUSE").length, senate: deduped.data.filter((row) => row.chamber === "SENATE").length, sourceAttempts: routed.attempts, ...persistence, lastSuccessfulSync: new Date().toISOString() };
  const health = await getPoliticalSyncHealth();
  await publishDatasetSnapshot({ dataset: "political_disclosures", payload: { records: deduped.data, politicians: [...byId.values()], history: { earliestDisclosureDate: health.earliestDisclosure, latestDisclosureDate: health.latestDisclosure, historyDays: health.historyDays, historyYears: health.historyYears, records: health.totalRecords } } as unknown as Record<string, unknown>, recordCount: health.totalRecords, coverage: health.mappingRate, sourceSucceeded: result.fetched > 0, schemaValid: true, allowVerifiedEmpty: false, sourceTimestamp: result.lastSuccessfulSync, expiresAt: new Date(Date.now() + 24 * 3_600_000).toISOString(), freshness: "FRESH", schemaVersion: "political-disclosures-v2", modelVersion: "political-normalizer-v1" }).catch(() => undefined);
  await finishIngestionRun(runId, "COMPLETED", { fetched: result.fetched, inserted: result.transactions, skipped: result.duplicatesRemoved }, { watermark: { earliestDisclosure: health.earliestDisclosure, latestDisclosure: health.latestDisclosure, historyDays: health.historyDays }, mappingRate: health.mappingRate, unresolved: health.unresolvedAssets });
  structuredLog("info", "political.ingestion.completed", { fetched: result.fetched, normalized: result.normalized, duplicatesRemoved: result.duplicatesRemoved, persisted: result.persisted });
  return result;
  } catch (error) {
    await finishIngestionRun(runId, "FAILED", { errors: 1 }, { watermark: {} });
    throw error;
  }
}

export interface PoliticalV3BackfillOptions { from: string; to: string; source?: PoliticalHistoricalSource; resume?: boolean; dryRun?: boolean; batchDays?: number; maxPages?: number; pageSize?: number; chamber?: "HOUSE" | "SENATE"; }

export async function backfillPoliticalHistoryV3(options: PoliticalV3BackfillOptions) {
  const from = options.from.slice(0, 10); const to = options.to.slice(0, 10); const source = options.source ?? "capitol-exposed"; const pageSize = Math.min(100, Math.max(10, options.pageSize ?? 100)); const maxPages = Math.min(500, Math.max(1, options.maxPages ?? 150));
  if (!/^\d{4}-\d{2}-\d{2}$/.test(from) || !/^\d{4}-\d{2}-\d{2}$/.test(to) || from > to) throw new Error("INVALID_POLITICAL_BACKFILL_WINDOW");
  if (source === "bargo" && Date.parse(to) - Date.parse(from) > 100 * 86_400_000) throw new Error("BARGO_HISTORY_WINDOW_EXCEEDS_KEYLESS_AVAILABILITY");
  const watermarkDataset = `political_disclosures:history:v3:${source}`; const runId = options.dryRun ? null : await beginIngestionRun("political-v3-historical-backfill", "political_disclosures", source, null); let fetched = 0; let processed = 0; let skipped = 0; let page = source === "bargo" ? 0 : 1; const accumulated = [] as Awaited<ReturnType<typeof normalizePoliticalRows>>["transactions"]; const sources = [source]; const resolutionCache = new Map<string, ResolvedInstrument | null>();
  try {
    if (!isDatabaseConfigured() && !options.dryRun) return { status: "SKIPPED" as const, reason: "database-not-configured", fetched, processed };
    if (options.resume && isDatabaseConfigured()) { const [saved] = await getDatabase().select().from(providerWatermarks).where(eq(providerWatermarks.dataset, watermarkDataset)).limit(1); const parsed = Number(saved?.cursor ?? page); if (Number.isInteger(parsed) && parsed >= 0) page = parsed; }
    const members = await politicalSourceRouter.getHistoricalMembers(source); let reachedFrom = false; let hasMore = true;
    for (let index = 0; index < maxPages && hasMore && !reachedFrom; index += 1, page += 1) {
      const response = await politicalSourceRouter.historicalPage(source, page, pageSize, { from, to, chamber: options.chamber, members }); fetched += response.rows.length; hasMore = response.hasMore;
      const eligible = response.rows.filter((row) => { const date = row.disclosureDate ?? row.transactionDate; return date >= from && date <= to && (!options.chamber || row.chamber === options.chamber); });
      const normalized = await normalizePoliticalRows(eligible, response.fetchedAt, { resolveInstruments: !options.dryRun, resolutionCache }); accumulated.push(...normalized.transactions); skipped += normalized.invalidRecords + normalized.duplicatesRemoved;
      if (!options.dryRun && normalized.transactions.length) { const persistence = await persistPoliticalTransactions({ transactions: normalized.transactions, politicians: normalized.politicians, houseRecords: normalized.transactions.filter((row) => row.chamber === "HOUSE").length, senateRecords: normalized.transactions.filter((row) => row.chamber === "SENATE").length, duplicatesRemoved: normalized.duplicatesRemoved }); processed += persistence.transactions; }
      const validDates = response.rows.map((row) => row.disclosureDate ?? row.transactionDate).filter((value): value is string => Boolean(value && /^\d{4}-\d{2}-\d{2}$/.test(value))).sort(); const oldest = validDates[0] ?? null; const newest = validDates.at(-1) ?? null; reachedFrom = source === "capitol-exposed" && Boolean(newest && newest < from);
      if (!options.dryRun) await recordProviderWatermark(source, watermarkDataset, true, oldest, { from, to, page, hasMore, reachedFrom, fetched, processed }, String(page + 1));
    }
    const deduped = deduplicatePoliticalTransactions(accumulated); const monthCoverage = calculatePoliticalHistoryMonths(deduped.data, from, to, sources); if (!options.dryRun) await persistPoliticalHistoryMonths(monthCoverage.map((month) => ({ ...month, metadata: { operationalSource: source, officialVerification: "PARTIAL" } })));
    const status = monthCoverage.every((month) => month.status === "AVAILABLE" || month.status === "PARTIAL") ? "COMPLETED" as const : "PARTIAL" as const; const health = await getPoliticalSyncHealth();
    if (runId) await finishIngestionRun(runId, status, { fetched, inserted: processed, skipped }, { watermark: { from, to, page, earliestDisclosure: health.earliestDisclosure, latestDisclosure: health.latestDisclosure }, months: monthCoverage.length, dryRun: Boolean(options.dryRun) });
    return { status, provider: source, fetched, processed, skipped, duplicatesRemoved: deduped.duplicatesRemoved, monthCoverage, health, dryRun: Boolean(options.dryRun) };
  } catch (error) { if (runId) await finishIngestionRun(runId, "FAILED", { fetched, inserted: processed, skipped, errors: 1 }, { watermark: { from, to, page } }); throw error; }
}

export async function backfillPoliticalDisclosures(options: { targetDays?: number; maxPagesPerChamber?: number; pageSize?: number } = {}) {
  const targetDays = Math.max(365, options.targetDays ?? 365); const maxPages = Math.min(50, Math.max(1, options.maxPagesPerChamber ?? 25)); const pageSize = Math.min(100, Math.max(5, options.pageSize ?? 20));
  const targetFrom = new Date(Date.now() - targetDays * 86_400_000).toISOString().slice(0, 10);
  const runId = await beginIngestionRun("fmp-political-backfill", "political_disclosures", "fmp", null);
  const adapter = new FmpPoliticalAdapter(); let fetched = 0; let processed = 0; let skipped = 0; let errors = 0;
  try {
    if (!isDatabaseConfigured()) return { status: "SKIPPED" as const, reason: "database-not-configured", fetched, processed };
    for (const chamber of ["HOUSE", "SENATE"] as const) {
      const dataset = `political_disclosures:${chamber.toLowerCase()}`;
      const [saved] = await getDatabase().select().from(providerWatermarks).where(eq(providerWatermarks.dataset, dataset)).limit(1);
      const metadata = saved?.metadata ?? {}; const complete = metadata.complete === true; let page = initialPoliticalBackfillPage(saved?.cursor, complete);
      for (let batchIndex = 0; batchIndex < (complete ? 1 : maxPages); batchIndex += 1) {
        try {
          const response = await adapter.getPage(chamber, page, pageSize); const normalized = await normalizePoliticalRows(response.data, response.meta.fetchedAt);
          fetched += response.data.length;
          if (!response.data.length) { await recordProviderWatermark("fmp", dataset, true, null, { targetFrom, complete: true, reason: "END_OF_DATA" }, "0"); break; }
          const persistence = await persistPoliticalTransactions({ transactions: normalized.transactions, politicians: normalized.politicians, houseRecords: chamber === "HOUSE" ? normalized.transactions.length : 0, senateRecords: chamber === "SENATE" ? normalized.transactions.length : 0, duplicatesRemoved: normalized.duplicatesRemoved });
          processed += persistence.transactions; skipped += normalized.duplicatesRemoved;
          const oldest = normalized.transactions.map((item) => item.disclosureDate).sort()[0] ?? null;
          const progress = advancePoliticalBackfill({ page, pageRecords: response.data.length, pageSize, oldestDisclosure: oldest, targetFrom });
          await recordProviderWatermark("fmp", dataset, true, oldest, { targetFrom, complete: progress.complete, reachedTarget: progress.reachedTarget, shortPage: progress.shortPage, pageRecords: response.data.length }, progress.cursor);
          if (progress.complete) break;
          page = progress.nextPage;
        } catch (error) {
          errors += 1; await recordProviderWatermark("fmp", dataset, false, null, { targetFrom, complete: false, errorClass: error instanceof Error ? error.name : "UNKNOWN" }, String(page)); break;
        }
      }
    }
    const health = await getPoliticalSyncHealth(); const status = errors ? fetched ? "PARTIAL" as const : "FAILED" as const : "COMPLETED" as const;
    await publishDatasetSnapshot({ dataset: "political_disclosures", payload: { history: { earliestDisclosureDate: health.earliestDisclosure, latestDisclosureDate: health.latestDisclosure, historyDays: health.historyDays, historyYears: health.historyYears, records: health.totalRecords }, mappingRate: health.mappingRate, unresolved: health.unresolvedAssets } as unknown as Record<string, unknown>, recordCount: health.totalRecords, coverage: health.mappingRate, sourceSucceeded: fetched > 0, schemaValid: true, allowVerifiedEmpty: false, sourceTimestamp: health.latestDisclosure, expiresAt: new Date(Date.now() + 24 * 3_600_000).toISOString(), freshness: errors ? "CACHED" : "FRESH", schemaVersion: "political-disclosures-v2", modelVersion: "political-normalizer-v1" });
    await finishIngestionRun(runId, status, { fetched, updated: processed, skipped, errors }, { watermark: { targetFrom, earliestDisclosure: health.earliestDisclosure, latestDisclosure: health.latestDisclosure, historyDays: health.historyDays }, mappingRate: health.mappingRate, unresolved: health.unresolvedAssets });
    return { status, fetched, processed, skipped, errors, health };
  } catch (error) { await finishIngestionRun(runId, "FAILED", { fetched, updated: processed, skipped, errors: Math.max(1, errors) }, { watermark: { targetFrom } }); throw error; }
}

export async function unresolvedPoliticalAssets(limit = 500) {
  if (!isDatabaseConfigured()) return [];
  const rows = await getDatabase().select().from(politicalTransactions).where(eq(politicalTransactions.resolutionStatus, "UNRESOLVED_ASSET")).limit(Math.min(2_000, Math.max(1, limit)));
  return rows.map((row) => ({ rawAsset: row.assetName, rawTicker: row.rawTicker, assetType: row.assetType, source: row.source, transactionDate: row.transactionDate.toISOString().slice(0, 10), reasonUnresolved: row.rawTicker ? "TICKER_NOT_VERIFIED" : "NO_UNAMBIGUOUS_MARKET_IDENTIFIER" }));
}
