import "server-only";

import { createHash } from "node:crypto";
import { count, desc, eq, max, min, sql } from "drizzle-orm";
import { getDatabase, isDatabaseConfigured, politicalFilings, politicalHistoryMonths, politicalSyncStates, politicalTransactions, politicalTransactionSources, politicians } from "@/db";
import { structuredLog } from "@/lib/server/logger";
import { ensureInstrument } from "@/services/account/instrument-repository";
import type { PoliticalTransaction, Politician } from "@/types";

const numeric = (value: number | null) => value === null ? null : String(value);
const dateOnly = (value: Date) => value.toISOString().slice(0, 10);
const numberOrNull = (value: string | null) => value === null ? null : Number(value);

export async function loadPersistedPoliticalTransactions(input: { symbol?: string; limit?: number } = {}) {
  if (!isDatabaseConfigured()) return null;
  try {
    const database = getDatabase(); const condition = input.symbol ? eq(politicalTransactions.symbol, input.symbol.toUpperCase()) : undefined;
    const rows = await database.select({ transaction: politicalTransactions, politician: politicians }).from(politicalTransactions).innerJoin(politicians, eq(politicalTransactions.politicianId, politicians.id)).where(condition).orderBy(desc(politicalTransactions.disclosureDate)).limit(Math.min(Math.max(input.limit ?? 500, 1), 2_000));
    if (!rows.length) return null;
    const politicianMap = new Map<string, Politician>();
    const transactions: PoliticalTransaction[] = rows.map(({ transaction: row, politician }) => {
      politicianMap.set(politician.id, { id: politician.id, normalizedName: politician.normalizedName, displayName: politician.displayName, chamber: politician.chamber, party: politician.party, state: politician.state, district: politician.district, activeStatus: politician.activeStatus as Politician["activeStatus"], sourceIdentifiers: politician.sourceIdentifiers, createdAt: politician.createdAt.toISOString(), updatedAt: politician.updatedAt.toISOString() });
      return { id: row.id, sourceId: row.sourceId, politicianId: row.politicianId, politicianName: politician.displayName, chamber: row.chamber, party: row.party, state: row.state, district: row.district, ownerType: row.ownerType, assetName: row.assetName, assetType: row.assetType, sector: row.sector, rawTicker: row.rawTicker, canonicalInstrumentId: row.instrumentId, canonicalIssuerId: row.canonicalIssuerId, symbol: row.symbol, transactionType: row.transactionType, transactionDate: dateOnly(row.transactionDate), disclosureDate: dateOnly(row.disclosureDate), marketAvailableDate: dateOnly(row.marketAvailableDate), disclosureDelayDays: row.disclosureDelayDays, amountMin: numberOrNull(row.amountMin), amountMax: numberOrNull(row.amountMax), amountRangeRaw: row.amountRangeRaw, estimatedAmount: numberOrNull(row.estimatedAmount), amountMethod: row.amountMethod as PoliticalTransaction["amountMethod"], priceAtTransaction: numberOrNull(row.priceAtTransaction), priceAtDisclosure: numberOrNull(row.priceAtDisclosure), currentPrice: numberOrNull(row.currentPrice), sharesEstimate: numberOrNull(row.sharesEstimate), source: row.source, sourceUrl: row.sourceUrl, filingId: row.filingId, filingType: row.filingType, provider: row.provider as PoliticalTransaction["provider"], fetchedAt: row.fetchedAt.toISOString(), verified: row.verified, verificationStatus: row.verificationStatus as PoliticalTransaction["verificationStatus"], resolutionStatus: row.resolutionStatus as PoliticalTransaction["resolutionStatus"], fingerprint: row.fingerprint, amendment: row.amendment, createdAt: row.createdAt.toISOString(), updatedAt: row.updatedAt.toISOString() };
    });
    const fetchedAt = rows.map(({ transaction }) => transaction.fetchedAt).sort((a, b) => b.getTime() - a.getTime())[0]!.toISOString();
    return { transactions, politicians: [...politicianMap.values()], duplicatesRemoved: 0, duplicateRate: 0, fetchedAt, invalidRecords: 0, status: "AVAILABLE" as const, isLastKnownGood: true };
  } catch (error) { structuredLog("warn", "political.persistence.read_failed", { code: error instanceof Error ? error.name : "UNKNOWN" }); return null; }
}

export async function persistPoliticalTransactions(input: { transactions: PoliticalTransaction[]; sourceTransactions?: PoliticalTransaction[]; politicians: Politician[]; houseRecords: number; senateRecords: number; duplicatesRemoved: number }) {
  if (!isDatabaseConfigured()) return { persisted: false, transactions: 0, mapped: 0, unresolved: input.transactions.filter((row) => row.resolutionStatus === "UNRESOLVED_ASSET").length };
  const database = getDatabase();
  const [previousSync] = await database.select().from(politicalSyncStates).where(eq(politicalSyncStates.key, "fmp-congressional")).limit(1);
  if (input.transactions.length === 0 && ((previousSync?.houseRecords ?? 0) + (previousSync?.senateRecords ?? 0)) > 0) {
    structuredLog("warn", "political.persistence.suspicious_empty_rejected", { previousRecords: (previousSync?.houseRecords ?? 0) + (previousSync?.senateRecords ?? 0) });
    return { persisted: false, transactions: 0, mapped: previousSync?.mappedInstruments ?? 0, unresolved: previousSync?.unresolvedAssets ?? 0, rejectedReason: "SUSPICIOUS_EMPTY" as const };
  }
  const instrumentsBySymbol = new Map<string, Awaited<ReturnType<typeof ensureInstrument>>>(); let stored = 0; let mapped = 0;
  for (const politician of input.politicians) await database.insert(politicians).values({ id: politician.id, normalizedName: politician.normalizedName, displayName: politician.displayName, chamber: politician.chamber, party: politician.party, state: politician.state, district: politician.district, activeStatus: politician.activeStatus, sourceIdentifiers: politician.sourceIdentifiers }).onConflictDoUpdate({ target: politicians.id, set: { displayName: politician.displayName, chamber: politician.chamber, party: politician.party, state: politician.state, district: politician.district, sourceIdentifiers: politician.sourceIdentifiers, updatedAt: new Date() } });
  for (const transaction of input.transactions) {
    let instrument = transaction.symbol ? instrumentsBySymbol.get(transaction.symbol) : undefined;
    if (!instrument && transaction.symbol && transaction.resolutionStatus === "RESOLVED") { instrument = await ensureInstrument({ symbol: transaction.symbol, name: transaction.assetName, type: transaction.symbol.endsWith("-USD") ? "CRYPTO" : "EQUITY" }).catch(() => undefined); if (instrument) instrumentsBySymbol.set(transaction.symbol, instrument); }
    let filingId: string | null = null;
    const filingSourceId = transaction.filingId ?? transaction.sourceId;
    const [filing] = await database.insert(politicalFilings).values({ politicianId: transaction.politicianId, provider: transaction.provider, sourceId: filingSourceId, filingType: transaction.filingType, disclosureDate: new Date(`${transaction.disclosureDate}T00:00:00Z`), sourceUrl: transaction.sourceUrl, amendment: transaction.amendment, fetchedAt: new Date(transaction.fetchedAt), payload: { sourceId: transaction.sourceId } }).onConflictDoUpdate({ target: [politicalFilings.provider, politicalFilings.sourceId], set: { sourceUrl: transaction.sourceUrl, amendment: transaction.amendment, fetchedAt: new Date(transaction.fetchedAt), updatedAt: new Date() } }).returning({ id: politicalFilings.id });
    filingId = filing?.id ?? (await database.select({ id: politicalFilings.id }).from(politicalFilings).where(eq(politicalFilings.sourceId, filingSourceId)).limit(1))[0]?.id ?? null;
    const values = { sourceId: transaction.sourceId, fingerprint: transaction.fingerprint, politicianId: transaction.politicianId, filingId, instrumentId: instrument?.id ?? null, canonicalIssuerId: instrument?.issuerId ?? null, chamber: transaction.chamber, party: transaction.party, state: transaction.state, district: transaction.district, ownerType: transaction.ownerType, assetName: transaction.assetName, assetType: transaction.assetType, rawTicker: transaction.rawTicker, symbol: transaction.symbol, sector: transaction.sector, transactionType: transaction.transactionType, transactionDate: new Date(`${transaction.transactionDate}T00:00:00Z`), disclosureDate: new Date(`${transaction.disclosureDate}T00:00:00Z`), marketAvailableDate: new Date(`${transaction.marketAvailableDate}T00:00:00Z`), disclosureDelayDays: transaction.disclosureDelayDays, amountMin: numeric(transaction.amountMin), amountMax: numeric(transaction.amountMax), amountRangeRaw: transaction.amountRangeRaw, estimatedAmount: numeric(transaction.estimatedAmount), amountMethod: transaction.amountMethod, priceAtTransaction: numeric(transaction.priceAtTransaction), priceAtDisclosure: numeric(transaction.priceAtDisclosure), currentPrice: numeric(transaction.currentPrice), sharesEstimate: numeric(transaction.sharesEstimate), source: transaction.source, sourceUrl: transaction.sourceUrl, filingType: transaction.filingType, provider: transaction.provider, fetchedAt: new Date(transaction.fetchedAt), verified: transaction.verified, verificationStatus: transaction.verificationStatus, resolutionStatus: transaction.resolutionStatus, amendment: transaction.amendment, rawPayload: { normalizedId: transaction.id } };
    const inserted = await database.insert(politicalTransactions).values(values).onConflictDoUpdate({ target: politicalTransactions.fingerprint, set: { instrumentId: values.instrumentId, canonicalIssuerId: values.canonicalIssuerId, symbol: values.symbol, sector: values.sector, sourceUrl: sql`coalesce(${politicalTransactions.sourceUrl}, excluded.source_url)`, fetchedAt: values.fetchedAt, resolutionStatus: values.resolutionStatus, updatedAt: new Date() } }).returning({ id: politicalTransactions.id });
    const logicalId = inserted[0]?.id ?? (await database.select({ id: politicalTransactions.id }).from(politicalTransactions).where(eq(politicalTransactions.fingerprint, transaction.fingerprint)).limit(1))[0]?.id;
    if (logicalId) {
      const sources = (input.sourceTransactions ?? input.transactions).filter((source) => source.fingerprint === transaction.fingerprint);
      for (const source of sources) {
        const rawHash = createHash("sha256").update(JSON.stringify({ provider: source.provider, sourceId: source.sourceId, fingerprint: source.fingerprint, sourceUrl: source.sourceUrl })).digest("hex");
        await database.insert(politicalTransactionSources).values({ politicalTransactionId: logicalId, provider: source.provider, externalId: source.sourceId, sourceUrl: source.sourceUrl, rawHash, fetchedAt: new Date(source.fetchedAt), verificationStatus: source.verificationStatus, rawPayload: { source: source.source, filingId: source.filingId } }).onConflictDoUpdate({ target: [politicalTransactionSources.provider, politicalTransactionSources.externalId], set: { politicalTransactionId: logicalId, sourceUrl: source.sourceUrl, rawHash, fetchedAt: new Date(source.fetchedAt), verificationStatus: source.verificationStatus, updatedAt: new Date() } });
      }
    }
    if (inserted.length) stored += 1; if (transaction.resolutionStatus === "RESOLVED") mapped += 1;
  }
  const dates = input.transactions.map((row) => row.disclosureDate).sort(); const earliest = dates[0]; const latest = dates.at(-1); const unresolved = input.transactions.filter((row) => row.resolutionStatus === "UNRESOLVED_ASSET").length; const metadata = { normalizedRecords: input.transactions.length, sourceRecords: (input.sourceTransactions ?? input.transactions).length, earliestDisclosure: earliest ?? null, latestDisclosure: latest ?? null };
  await database.insert(politicalSyncStates).values({ key: "fmp-congressional", lastSuccessfulSync: new Date(), houseRecords: input.houseRecords, senateRecords: input.senateRecords, mappedInstruments: mapped, unresolvedAssets: unresolved, duplicatesRemoved: input.duplicatesRemoved, latestDisclosure: latest ? new Date(`${latest}T00:00:00Z`) : null, providerStatus: "OK", metadata }).onConflictDoUpdate({ target: politicalSyncStates.key, set: { lastSuccessfulSync: new Date(), houseRecords: input.houseRecords, senateRecords: input.senateRecords, mappedInstruments: mapped, unresolvedAssets: unresolved, duplicatesRemoved: input.duplicatesRemoved, latestDisclosure: latest ? new Date(`${latest}T00:00:00Z`) : null, providerStatus: "OK", metadata, updatedAt: new Date() } });
  return { persisted: true, transactions: stored, mapped, unresolved };
}

export async function persistPoliticalHistoryMonths(months: Array<{ month: string; status: "AVAILABLE" | "PARTIAL" | "UNAVAILABLE" | "NOT_CHECKED"; recordCount: number; houseRecords: number; senateRecords: number; sources: string[]; checkedAt?: string | null; metadata?: Record<string, unknown> }>) {
  if (!isDatabaseConfigured() || !months.length) return false;
  const database = getDatabase();
  for (const month of months) await database.insert(politicalHistoryMonths).values({ ...month, checkedAt: month.checkedAt ? new Date(month.checkedAt) : null, metadata: month.metadata ?? {} }).onConflictDoUpdate({ target: politicalHistoryMonths.month, set: { status: month.status, recordCount: month.recordCount, houseRecords: month.houseRecords, senateRecords: month.senateRecords, sources: month.sources, checkedAt: month.checkedAt ? new Date(month.checkedAt) : null, metadata: month.metadata ?? {}, updatedAt: new Date() } });
  return true;
}

export async function summarizePersistedPoliticalTransactionsByMonth(from: string, to: string) {
  if (!isDatabaseConfigured()) return [];
  const database = getDatabase();
  const start = new Date(`${from.slice(0, 10)}T00:00:00Z`);
  const end = new Date(`${to.slice(0, 10)}T00:00:00Z`);
  end.setUTCDate(end.getUTCDate() + 1);
  const rows = await database.execute<{
    month: string;
    record_count: number;
    house_records: number;
    senate_records: number;
    sources: string[];
  }>(sql`
    select
      to_char(${politicalTransactions.disclosureDate} at time zone 'UTC', 'YYYY-MM') as month,
      count(*)::int as record_count,
      count(*) filter (where ${politicalTransactions.chamber} = 'HOUSE')::int as house_records,
      count(*) filter (where ${politicalTransactions.chamber} = 'SENATE')::int as senate_records,
      coalesce(array_agg(distinct ${politicalTransactions.provider}), array[]::varchar[]) as sources
    from ${politicalTransactions}
    where ${politicalTransactions.disclosureDate} >= ${start}
      and ${politicalTransactions.disclosureDate} < ${end}
    group by 1
    order by 1
  `);
  return rows.map((row) => ({
    month: row.month,
    recordCount: Number(row.record_count ?? 0),
    houseRecords: Number(row.house_records ?? 0),
    senateRecords: Number(row.senate_records ?? 0),
    sources: Array.isArray(row.sources) ? row.sources : [],
  }));
}

export async function loadPoliticalHistoryMonths() {
  if (!isDatabaseConfigured()) return [];
  try { return (await getDatabase().select().from(politicalHistoryMonths).orderBy(politicalHistoryMonths.month)).map((row) => ({ month: row.month, status: row.status as "AVAILABLE" | "PARTIAL" | "UNAVAILABLE" | "NOT_CHECKED", recordCount: row.recordCount, houseRecords: row.houseRecords, senateRecords: row.senateRecords, sources: row.sources, checkedAt: row.checkedAt?.toISOString() ?? null })); } catch { return []; }
}

export async function getPoliticalSyncHealth() {
  const empty = { lastSync: null, houseRecords: 0, senateRecords: 0, mappedInstruments: 0, unresolvedAssets: 0, duplicatesRemoved: 0, latestDisclosure: null, earliestDisclosure: null, historyDays: 0, historyYears: 0, totalRecords: 0, mappingRate: 0 };
  if (!isDatabaseConfigured()) return { databaseConfigured: false, databaseStatus: "NOT_CONFIGURED", ...empty, fmpStatus: "RUNTIME_ONLY" };
  try {
    const database = getDatabase();
    const [row, aggregate, chambers] = await Promise.all([
      database.select().from(politicalSyncStates).where(eq(politicalSyncStates.key, "fmp-congressional")).limit(1).then((rows) => rows[0]),
      database.select({ total: count(), earliest: min(politicalTransactions.disclosureDate), latest: max(politicalTransactions.disclosureDate), mapped: sql<number>`count(*) filter (where ${politicalTransactions.resolutionStatus} = 'RESOLVED')`, unresolved: sql<number>`count(*) filter (where ${politicalTransactions.resolutionStatus} = 'UNRESOLVED_ASSET')` }).from(politicalTransactions).then((rows) => rows[0]),
      database.select({ chamber: politicalTransactions.chamber, total: count() }).from(politicalTransactions).groupBy(politicalTransactions.chamber),
    ]);
    const totalRecords = Number(aggregate?.total ?? 0); const mapped = Number(aggregate?.mapped ?? 0); const unresolvedAssets = Number(aggregate?.unresolved ?? 0); const resolvable = mapped + unresolvedAssets;
    const chamberCount = (name: "HOUSE" | "SENATE") => Number(chambers.find((item) => item.chamber === name)?.total ?? 0);
    const earliestDisclosure = aggregate?.earliest?.toISOString().slice(0, 10) ?? null; const latestDisclosure = aggregate?.latest?.toISOString() ?? null;
    const historyDays = earliestDisclosure && latestDisclosure ? Math.max(0, Math.floor((Date.parse(latestDisclosure) - Date.parse(`${earliestDisclosure}T00:00:00Z`)) / 86_400_000)) : 0;
    const historyMonths = await loadPoliticalHistoryMonths();
    return { databaseConfigured: true, databaseStatus: "AVAILABLE", lastSync: row?.lastSuccessfulSync?.toISOString() ?? null, houseRecords: chamberCount("HOUSE"), senateRecords: chamberCount("SENATE"), mappedInstruments: mapped, unresolvedAssets, duplicatesRemoved: row?.duplicatesRemoved ?? 0, latestDisclosure, earliestDisclosure, historyDays, historyYears: historyDays / 365.2425, totalRecords, mappingRate: resolvable ? mapped / resolvable * 100 : 0, fmpStatus: row?.providerStatus ?? "NOT_SYNCED", operationalStatus: historyMonths.length ? "OK" : row?.providerStatus ?? "NOT_SYNCED", historyMonths };
  } catch (error) {
    structuredLog("warn", "political.health.persistence_unavailable", { errorType: error instanceof Error ? error.name : "UnknownError" });
    return { databaseConfigured: true, databaseStatus: "UNAVAILABLE", ...empty, fmpStatus: "RUNTIME_ONLY" };
  }
}
