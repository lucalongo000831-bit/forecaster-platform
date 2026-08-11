import "server-only";

import { desc } from "drizzle-orm";
import { dataQualityRecords, dataSnapshots, getDatabase, ingestionRuns, isDatabaseConfigured, lastKnownGood, providerQuotaStates, providerWatermarks } from "@/db";

export const CRITICAL_DATASETS = ["market_calendar", "political_disclosures", "economic_observations", "positioning", "news", "global_risk"] as const;

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
