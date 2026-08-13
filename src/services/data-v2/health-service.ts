import "server-only";

import { count, desc, eq, sql } from "drizzle-orm";
import { calendarEvents, dataQualityRecords, dataSnapshots, economicReleaseEvents, getDatabase, ingestionRuns, isDatabaseConfigured, lastKnownGood, politicalTransactions, providerQuotaStates, providerWatermarks } from "@/db";
import { getPoliticalSyncHealth } from "@/services/political/political-repository";
import { getSchedulerHeartbeats } from "@/services/jobs/scheduler-heartbeat";
import { loadLatestGlobalRiskSnapshot } from "@/services/global-risk/global-risk-repository";
import type { MarketCalendarAnalysis } from "@/types";

export const CRITICAL_DATASETS = ["market_calendar", "political_disclosures", "economic_observations", "energy_observations", "positioning", "news", "global_risk"] as const;

export async function getDataArchitectureHealth() {
  if (!isDatabaseConfigured()) return { database: "NOT_CONFIGURED" as const, overall: "DEGRADED" as const, datasets: [], providers: [], runs: [] };
  try {
    const database = getDatabase(); const [snapshots, lkg, watermarks, providers, runs, quality] = await Promise.all([
      database.select().from(dataSnapshots).orderBy(desc(dataSnapshots.calculatedAt)).limit(200), database.select().from(lastKnownGood), database.select().from(providerWatermarks), database.select().from(providerQuotaStates), database.select().from(ingestionRuns).orderBy(desc(ingestionRuns.startedAt)).limit(50), database.select().from(dataQualityRecords).orderBy(desc(dataQualityRecords.evaluatedAt)).limit(200),
    ]);
    const lkgKeys = new Set(lkg.map((item) => `${item.dataset}:${item.entityKey}`));
    const datasets = CRITICAL_DATASETS.map((dataset) => { const latest = snapshots.find((item) => item.dataset === dataset); const lastQuality = quality.find((item) => item.dataset === dataset); const status = latest ? latest.published ? latest.expiresAt && latest.expiresAt.getTime() < Date.now() ? "STALE" : latest.status : "REJECTED" : "NEVER_SEEN"; return { dataset, status, recordCount: latest?.recordCount ?? null, coverage: latest?.coverage === null || latest?.coverage === undefined ? null : Number(latest.coverage), calculatedAt: latest?.calculatedAt.toISOString() ?? null, hasLastKnownGood: latest ? lkgKeys.has(`${dataset}:${latest.entityKey}`) : lkg.some((item) => item.dataset === dataset), anomalies: lastQuality?.anomalies ?? [] }; });
    const unavailable = datasets.filter((item) => item.status === "NEVER_SEEN" || item.status === "REJECTED").length;
    return { database: "AVAILABLE" as const, overall: unavailable >= 3 ? "DEGRADED" as const : "OK" as const, datasets, providers: providers.map((item) => ({ provider: item.provider, circuitState: item.circuitState, lastRateLimitedAt: item.lastRateLimitedAt?.toISOString() ?? null, failuresToday: item.failuresToday })), watermarks: watermarks.map((item) => ({ provider: item.provider, dataset: item.dataset, lastAttempt: item.lastAttempt?.toISOString() ?? null, lastSuccessfulSync: item.lastSuccessfulSync?.toISOString() ?? null, lastExternalTimestamp: item.lastExternalTimestamp?.toISOString() ?? null })), runs: runs.map((item) => ({ id: item.id, jobName: item.jobName, provider: item.provider, status: item.status, startedAt: item.startedAt.toISOString(), endedAt: item.endedAt?.toISOString() ?? null, fetched: item.recordsFetched, inserted: item.recordsInserted, errors: item.errors })) };
  } catch { return { database: "UNAVAILABLE" as const, overall: "DEGRADED" as const, datasets: [], providers: [], runs: [] }; }
}

export type MergeGateState = "PASS" | "FAIL" | "UNKNOWN";
export interface MergeGateMetric { label: string; state: MergeGateState; value: string; reason: string; }

export async function getKairoV2MergeGate() {
  if (!isDatabaseConfigured()) return { ready: false, evaluatedAt: new Date().toISOString(), metrics: [{ label: "Database", state: "FAIL" as const, value: "NOT CONFIGURED", reason: "Persistent evidence is unavailable." }] };
  const database = getDatabase();
  const [calendarSnapshot, political, global, heartbeats, runs, lkg, duplicateStoredCalendar, duplicateOfficialCalendar, duplicatePolitical] = await Promise.all([
    database.select().from(dataSnapshots).where(eq(dataSnapshots.dataset, "market_calendar")).orderBy(desc(dataSnapshots.calculatedAt)).limit(1).then((rows) => rows[0] ?? null),
    getPoliticalSyncHealth(), loadLatestGlobalRiskSnapshot(), getSchedulerHeartbeats(),
    database.select().from(ingestionRuns).orderBy(desc(ingestionRuns.startedAt)).limit(100), database.select().from(lastKnownGood),
    database.select({ provider: calendarEvents.provider, sourceId: calendarEvents.providerRecordId, total: count() }).from(calendarEvents).groupBy(calendarEvents.provider, calendarEvents.providerRecordId).having(sql`count(*) > 1`),
    database.select({ provider: economicReleaseEvents.provider, sourceId: economicReleaseEvents.sourceId, total: count() }).from(economicReleaseEvents).groupBy(economicReleaseEvents.provider, economicReleaseEvents.sourceId).having(sql`count(*) > 1`),
    database.select({ fingerprint: politicalTransactions.fingerprint, total: count() }).from(politicalTransactions).groupBy(politicalTransactions.fingerprint).having(sql`count(*) > 1`),
  ]);
  const calendar = calendarSnapshot?.payload as unknown as MarketCalendarAnalysis | undefined;
  const calendarCoverage = calendar?.coverage?.overallCoverage ?? (calendarSnapshot?.coverage === null || calendarSnapshot?.coverage === undefined ? null : Number(calendarSnapshot.coverage));
  const criticalJobs = ["fred-release-calendar", "official-central-bank-calendar", "fmp-political-backfill"];
  const successful = (job: string) => runs.filter((run) => run.jobName === job && (run.status === "COMPLETED" || run.status === "PARTIAL"));
  const idempotentCalendar = successful("fred-release-calendar").slice(0, 2).length === 2 && successful("official-central-bank-calendar").slice(0, 2).length === 2;
  const idempotentPolitical = successful("fmp-political-backfill").slice(0, 2).length === 2;
  const duplicateRows = duplicateStoredCalendar.length + duplicateOfficialCalendar.length + duplicatePolitical.length;
  const schedulerRequired = ["data-v2-calendar", "data-v2-central-bank", "data-v2-political", "data-v2-global-risk"];
  const schedulerPass = schedulerRequired.every((job) => heartbeats.some((heartbeat) => heartbeat.name === job && heartbeat.status === "HEALTHY"));
  const lkgDatasets = new Set(lkg.map((item) => item.dataset));
  const metrics: MergeGateMetric[] = [
    { label: "Calendar core coverage", state: calendarCoverage !== null && calendarCoverage >= 95 ? "PASS" : "FAIL", value: calendarCoverage === null ? "UNAVAILABLE" : `${calendarCoverage.toFixed(1)}%`, reason: "Target >=95% across Earnings, Dividends, Macro and Central Bank datasets." },
    { label: "Political history", state: political.historyDays >= 365 ? "PASS" : "FAIL", value: `${political.historyDays} days`, reason: "Target >=365 persisted days." },
    { label: "Political mapping", state: political.mappingRate >= 98 || (political.unresolvedAssets === 0 && political.totalRecords > 0) ? "PASS" : "FAIL", value: `${political.mappingRate.toFixed(2)}% · ${political.unresolvedAssets} unresolved`, reason: "Target >=98%, or all resolvable assets mapped." },
    { label: "Global layers", state: global?.activeLayers === 11 ? "PASS" : "FAIL", value: global ? `${global.activeLayers}/11 · ${global.dataCompleteness}% effective` : "UNAVAILABLE", reason: "A new persisted global snapshot must retain all 11 layers." },
    { label: "Global direct + calculated", state: global && global.directDataCoverage >= 75 ? "PASS" : "FAIL", value: global ? `${global.rawDirectCoverage}% direct + ${global.calculatedFromDirectCoverage}% calculated` : "UNAVAILABLE", reason: "Target >=75% from direct observations and calculations from direct inputs." },
    { label: "Scheduler", state: schedulerPass ? "PASS" : "FAIL", value: `${heartbeats.filter((item) => item.status === "HEALTHY").length}/${heartbeats.length} healthy`, reason: "Critical server-side jobs require a healthy persisted heartbeat." },
    { label: "Idempotency", state: duplicateRows > 0 ? "FAIL" : idempotentCalendar && idempotentPolitical ? "PASS" : "UNKNOWN", value: `${criticalJobs.filter((job) => successful(job).length >= 2).length}/${criticalJobs.length} double-run evidence · ${duplicateRows} logical duplicates`, reason: "Two successful executions and zero logical duplicates are required before PASS." },
    { label: "Last-known-good", state: ["market_calendar", "political_disclosures", "global_risk"].every((dataset) => lkgDatasets.has(dataset)) ? "PASS" : "FAIL", value: `${["market_calendar", "political_disclosures", "global_risk"].filter((dataset) => lkgDatasets.has(dataset)).length}/3 critical LKG`, reason: "Calendar, Political and Global Risk must survive cold instances through persistent LKG." },
  ];
  return { ready: metrics.every((metric) => metric.state === "PASS"), evaluatedAt: new Date().toISOString(), metrics };
}
