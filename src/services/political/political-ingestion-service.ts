import "server-only";

import { deduplicatePoliticalTransactions } from "@/engines/political";
import { structuredLog } from "@/lib/server/logger";
import { politicalDataRouter } from "./political-data-router";
import { persistPoliticalTransactions } from "./political-repository";
import { publishDatasetSnapshot } from "@/services/data-v2";

export async function syncPoliticalDisclosures(options: { limit?: number } = {}) {
  const limit = Math.min(500, Math.max(20, options.limit ?? 100));
  const [house, senate] = await Promise.all([politicalDataRouter.getLatestHouseTrades(limit), politicalDataRouter.getLatestSenateTrades(limit)]);
  const deduped = deduplicatePoliticalTransactions([...house.transactions, ...senate.transactions]); const byId = new Map([...house.politicians, ...senate.politicians].map((item) => [item.id, item]));
  const persistence = await persistPoliticalTransactions({ transactions: deduped.data, politicians: [...byId.values()], houseRecords: house.transactions.length, senateRecords: senate.transactions.length, duplicatesRemoved: deduped.duplicatesRemoved + house.duplicatesRemoved + senate.duplicatesRemoved }).catch((error) => { structuredLog("warn", "political.ingestion.persistence_failed", { code: error instanceof Error ? error.name : "UNKNOWN" }); return { persisted: false, transactions: 0, mapped: deduped.data.filter((row) => row.resolutionStatus === "RESOLVED").length, unresolved: deduped.data.filter((row) => row.resolutionStatus === "UNRESOLVED_ASSET").length }; });
  const result = { fetched: house.transactions.length + senate.transactions.length, normalized: deduped.data.length, duplicatesRemoved: deduped.duplicatesRemoved, house: house.transactions.length, senate: senate.transactions.length, ...persistence, lastSuccessfulSync: new Date().toISOString() };
  await publishDatasetSnapshot({ dataset: "political_disclosures", payload: { records: deduped.data, politicians: [...byId.values()] } as unknown as Record<string, unknown>, recordCount: deduped.data.length, coverage: deduped.data.length ? deduped.data.filter((row) => row.resolutionStatus === "RESOLVED").length / deduped.data.length * 100 : null, sourceSucceeded: result.fetched > 0, schemaValid: true, allowVerifiedEmpty: false, sourceTimestamp: result.lastSuccessfulSync, expiresAt: new Date(Date.now() + 24 * 3_600_000).toISOString(), freshness: "FRESH", schemaVersion: "political-disclosures-v2", modelVersion: "political-normalizer-v1" }).catch(() => undefined);
  structuredLog("info", "political.ingestion.completed", { fetched: result.fetched, normalized: result.normalized, duplicatesRemoved: result.duplicatesRemoved, persisted: result.persisted });
  return result;
}
