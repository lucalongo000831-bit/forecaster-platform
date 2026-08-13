import "server-only";

import { count, sql } from "drizzle-orm";
import { getDatabase, isDatabaseConfigured, politicalHistoryMonths, politicalTransactions, politicalTransactionSources, providerWatermarks } from "@/db";
import { AppError } from "@/lib/server/app-error";
import { getPoliticalSyncHealth } from "./political-repository";

type SchemaProbe = { sources_table: string | null; months_table: string | null; enum_values: string[] | null };

export async function getPoliticalV3AdminStatus() {
  if (!isDatabaseConfigured()) return { database: "NOT_CONFIGURED" as const, schema: "MIGRATION_REQUIRED" as const, transactionSources: 0, historyMonths: 0, watermarks: [], health: await getPoliticalSyncHealth() };
  const database = getDatabase();
  const result = await database.execute<SchemaProbe>(sql`
    select
      to_regclass('public.political_transaction_sources')::text as sources_table,
      to_regclass('public.political_history_months')::text as months_table,
      coalesce(array_agg(enumlabel order by enumsortorder) filter (where enumlabel is not null), array[]::text[]) as enum_values
    from pg_type
    left join pg_enum on pg_enum.enumtypid = pg_type.oid
    where pg_type.typname = 'political_verification_status'
    group by 1, 2
  `);
  const probe = result[0];
  const requiredEnums = ["BARGO_ONLY", "FMP_ONLY", "CAPITOL_EXPOSED_ONLY", "BARGO_FMP_MATCH", "HOUSE_OFFICIAL_VERIFIED", "SENATE_OFFICIAL_VERIFIED", "MULTI_SOURCE_VERIFIED", "CONFLICT", "PENDING_VERIFICATION"];
  const current = Boolean(probe?.sources_table && probe?.months_table && requiredEnums.every((value) => probe.enum_values?.includes(value)));
  const [sourceCount, monthCount, watermarks, health] = await Promise.all([
    current ? database.select({ total: count() }).from(politicalTransactionSources).then((rows) => Number(rows[0]?.total ?? 0)) : Promise.resolve(0),
    current ? database.select({ total: count() }).from(politicalHistoryMonths).then((rows) => Number(rows[0]?.total ?? 0)) : Promise.resolve(0),
    database.select({ provider: providerWatermarks.provider, dataset: providerWatermarks.dataset, cursor: providerWatermarks.cursor, lastSuccessAt: providerWatermarks.lastSuccessfulSync, sourceTimestamp: providerWatermarks.lastExternalTimestamp, metadata: providerWatermarks.metadata }).from(providerWatermarks).then((rows) => rows.filter((row) => row.dataset.startsWith("political_disclosures"))).catch(() => []),
    getPoliticalSyncHealth(),
  ]);
  return { database: "AVAILABLE" as const, schema: current ? "CURRENT" as const : "MIGRATION_REQUIRED" as const, transactionSources: sourceCount, historyMonths: monthCount, watermarks: watermarks.map((row) => ({ ...row, lastSuccessAt: row.lastSuccessAt?.toISOString() ?? null, sourceTimestamp: row.sourceTimestamp?.toISOString() ?? null })), health };
}

export async function applyAdditivePoliticalV3Migration() {
  if (!isDatabaseConfigured()) throw new AppError("NOT_CONFIGURED", "Database Preview non configurato", 503);
  const database = getDatabase();
  for (const value of ["BARGO_ONLY", "FMP_ONLY", "CAPITOL_EXPOSED_ONLY", "BARGO_FMP_MATCH", "HOUSE_OFFICIAL_VERIFIED", "SENATE_OFFICIAL_VERIFIED", "MULTI_SOURCE_VERIFIED", "CONFLICT", "PENDING_VERIFICATION"]) {
    await database.execute(sql.raw(`ALTER TYPE "public"."political_verification_status" ADD VALUE IF NOT EXISTS '${value}'`));
  }
  await database.execute(sql`
    CREATE TABLE IF NOT EXISTS "political_transaction_sources" (
      "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
      "political_transaction_id" uuid NOT NULL REFERENCES "public"."political_transactions"("id") ON DELETE cascade,
      "provider" varchar(40) NOT NULL,
      "external_id" varchar(240) NOT NULL,
      "source_url" text,
      "raw_hash" varchar(64) NOT NULL,
      "fetched_at" timestamp with time zone NOT NULL,
      "verification_status" varchar(48) NOT NULL,
      "raw_payload" jsonb DEFAULT '{}'::jsonb NOT NULL,
      "created_at" timestamp with time zone DEFAULT now() NOT NULL,
      "updated_at" timestamp with time zone DEFAULT now() NOT NULL
    )
  `);
  await database.execute(sql`CREATE UNIQUE INDEX IF NOT EXISTS "political_transaction_source_unique" ON "political_transaction_sources" ("provider", "external_id")`);
  await database.execute(sql`CREATE INDEX IF NOT EXISTS "political_transaction_source_transaction_idx" ON "political_transaction_sources" ("political_transaction_id")`);
  await database.execute(sql`CREATE INDEX IF NOT EXISTS "political_transaction_source_status_idx" ON "political_transaction_sources" ("verification_status")`);
  await database.execute(sql`
    CREATE TABLE IF NOT EXISTS "political_history_months" (
      "month" varchar(7) PRIMARY KEY NOT NULL,
      "status" varchar(24) NOT NULL,
      "record_count" integer DEFAULT 0 NOT NULL,
      "house_records" integer DEFAULT 0 NOT NULL,
      "senate_records" integer DEFAULT 0 NOT NULL,
      "sources" jsonb DEFAULT '[]'::jsonb NOT NULL,
      "checked_at" timestamp with time zone,
      "metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
      "created_at" timestamp with time zone DEFAULT now() NOT NULL,
      "updated_at" timestamp with time zone DEFAULT now() NOT NULL
    )
  `);
  const status = await getPoliticalV3AdminStatus();
  if (status.schema !== "CURRENT") throw new AppError("DATABASE_UNAVAILABLE", "Verifica schema Political V3 non riuscita", 503);
  return status;
}

export async function getPoliticalV3QualityDiagnostics() {
  const status = await getPoliticalV3AdminStatus();
  if (status.schema !== "CURRENT") return { ...status, logicalDuplicates: null, multiSourceTransactions: null, conflicts: null, conflictTypes: [] as string[] };
  const database = getDatabase();
  const [aggregates] = await database.select({
    total: count(),
    logicalDuplicates: sql<number>`count(*) - count(distinct ${politicalTransactions.fingerprint})`,
    conflicts: sql<number>`count(*) filter (where ${politicalTransactions.verificationStatus} = 'CONFLICT')`,
  }).from(politicalTransactions);
  const [multiSource] = await database.execute<{ total: number }>(sql`select count(*)::int as total from (select political_transaction_id from political_transaction_sources group by political_transaction_id having count(distinct provider) > 1) matched`);
  return { ...status, logicalDuplicates: Number(aggregates?.logicalDuplicates ?? 0), multiSourceTransactions: Number(multiSource?.total ?? 0), conflicts: Number(aggregates?.conflicts ?? 0), conflictTypes: Number(aggregates?.conflicts ?? 0) ? ["VERIFICATION_STATUS_CONFLICT"] : [] };
}
