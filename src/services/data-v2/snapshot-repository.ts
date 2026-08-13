import "server-only";

import { createHash } from "node:crypto";
import { and, desc, eq } from "drizzle-orm";
import { dataQualityRecords, dataSnapshots, getDatabase, isDatabaseConfigured, lastKnownGood, rawProviderRecords } from "@/db";
import { redactProviderRequest } from "@/providers/security/redaction";
import type { DataFreshnessClass, DataStatus, DatasetSnapshotEnvelope } from "@/types";
import { evaluateQualityGate } from "./quality-gate";

function stableJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`;
  if (value && typeof value === "object") return `{${Object.entries(value as Record<string, unknown>).sort(([a], [b]) => a.localeCompare(b)).map(([key, item]) => `${JSON.stringify(key)}:${stableJson(item)}`).join(",")}}`;
  return JSON.stringify(value);
}

export function providerPayloadHash(payload: unknown) {
  return createHash("sha256").update(stableJson(payload)).digest("hex");
}

export async function persistRawProviderRecord(input: {
  provider: string;
  dataset: string;
  externalId?: string | null;
  entityKey: string;
  payload: Record<string, unknown>;
  sourceUrl?: string | URL | null;
  sourcePublishedAt?: string | null;
  schemaVersion: string;
}) {
  if (!isDatabaseConfigured()) return { persisted: false, id: null };
  const sanitizedPayload = redactProviderRequest({ body: input.payload }).body as Record<string, unknown>;
  const sanitizedUrl = input.sourceUrl ? redactProviderRequest({ url: input.sourceUrl }).url : null;
  const [row] = await getDatabase().insert(rawProviderRecords).values({
    provider: input.provider,
    dataset: input.dataset,
    externalId: input.externalId,
    entityKey: input.entityKey,
    payload: sanitizedPayload,
    payloadHash: providerPayloadHash(sanitizedPayload),
    sourceUrl: sanitizedUrl,
    sourcePublishedAt: input.sourcePublishedAt ? new Date(input.sourcePublishedAt) : null,
    schemaVersion: input.schemaVersion,
  }).onConflictDoNothing({ target: [rawProviderRecords.provider, rawProviderRecords.dataset, rawProviderRecords.payloadHash] }).returning({ id: rawProviderRecords.id });
  return { persisted: Boolean(row), id: row?.id ?? null };
}

function rowToEnvelope<T>(row: typeof dataSnapshots.$inferSelect, lkg = false): DatasetSnapshotEnvelope<T> {
  const stale = Boolean(row.expiresAt && row.expiresAt.getTime() < Date.now());
  return {
    dataset: row.dataset,
    entityKey: row.entityKey,
    schemaVersion: row.schemaVersion,
    modelVersion: row.modelVersion,
    status: stale ? "STALE" : row.status as DataStatus,
    freshness: stale ? "STALE" : row.freshness as DataFreshnessClass,
    payload: row.payload as T,
    recordCount: row.recordCount,
    coverage: row.coverage === null ? null : Number(row.coverage),
    sourceTimestamp: row.sourceTimestamp?.toISOString() ?? null,
    calculatedAt: row.calculatedAt.toISOString(),
    expiresAt: row.expiresAt?.toISOString() ?? null,
    published: row.published,
    isLastKnownGood: lkg,
    qualityReasons: row.qualityReasons,
  };
}

export async function loadLastKnownGood<T>(dataset: string, entityKey = "global"): Promise<DatasetSnapshotEnvelope<T> | null> {
  if (!isDatabaseConfigured()) return null;
  try {
    const [row] = await getDatabase().select({ snapshot: dataSnapshots }).from(lastKnownGood)
      .innerJoin(dataSnapshots, eq(lastKnownGood.snapshotId, dataSnapshots.id))
      .where(and(eq(lastKnownGood.dataset, dataset), eq(lastKnownGood.entityKey, entityKey))).limit(1);
    return row ? rowToEnvelope<T>(row.snapshot, true) : null;
  } catch {
    return null;
  }
}

export async function loadLatestSnapshot<T>(dataset: string, entityKey = "global") {
  if (!isDatabaseConfigured()) return null;
  try {
    const [row] = await getDatabase().select().from(dataSnapshots).where(and(eq(dataSnapshots.dataset, dataset), eq(dataSnapshots.entityKey, entityKey))).orderBy(desc(dataSnapshots.calculatedAt)).limit(1);
    return row ? rowToEnvelope<T>(row) : null;
  } catch {
    return null;
  }
}

export async function publishDatasetSnapshot<T extends Record<string, unknown>>(input: {
  dataset: string;
  entityKey?: string;
  payload: T;
  recordCount: number;
  coverage: number | null;
  sourceSucceeded: boolean;
  schemaValid: boolean;
  allowVerifiedEmpty?: boolean;
  sourceTimestamp?: string | null;
  expiresAt?: string | null;
  freshness?: DataFreshnessClass;
  schemaVersion: string;
  modelVersion?: string | null;
}) {
  const entityKey = input.entityKey ?? "global";
  const previous = await loadLastKnownGood<T>(input.dataset, entityKey);
  const gate = evaluateQualityGate({ previousRecordCount: previous?.recordCount ?? null, previousCoverage: previous?.coverage ?? null, candidateRecordCount: input.recordCount, candidateCoverage: input.coverage, sourceSucceeded: input.sourceSucceeded, schemaValid: input.schemaValid, allowVerifiedEmpty: input.allowVerifiedEmpty });
  if (!isDatabaseConfigured()) return { current: gate.accepted ? null : previous, gate, persisted: false };

  const current = await getDatabase().transaction(async (transaction) => {
    const [candidate] = await transaction.insert(dataSnapshots).values({
      dataset: input.dataset,
      entityKey,
      status: gate.status,
      freshness: input.freshness ?? "FRESH",
      payload: input.payload,
      recordCount: input.recordCount,
      coverage: input.coverage === null ? null : String(input.coverage),
      sourceTimestamp: input.sourceTimestamp ? new Date(input.sourceTimestamp) : null,
      expiresAt: input.expiresAt ? new Date(input.expiresAt) : null,
      schemaVersion: input.schemaVersion,
      modelVersion: input.modelVersion,
      published: gate.accepted,
      qualityReasons: gate.reasons,
    }).returning();
    if (!candidate) throw new Error("SNAPSHOT_INSERT_FAILED");

    await transaction.insert(dataQualityRecords).values({
      dataset: input.dataset,
      entityKey,
      snapshotId: candidate.id,
      status: gate.accepted ? "AVAILABLE" : "PARTIAL",
      coverage: input.coverage === null ? null : String(input.coverage),
      anomalies: gate.reasons,
    });

    if (gate.accepted) {
      await transaction.insert(lastKnownGood).values({ dataset: input.dataset, entityKey, snapshotId: candidate.id })
        .onConflictDoUpdate({ target: [lastKnownGood.dataset, lastKnownGood.entityKey], set: { snapshotId: candidate.id, promotedAt: new Date(), updatedAt: new Date() } });
    }
    return rowToEnvelope<T>(candidate, gate.accepted);
  });

  return { current: gate.accepted ? current : previous, candidate: current, gate, persisted: true };
}
