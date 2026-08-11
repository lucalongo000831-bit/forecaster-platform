import "server-only";

import { desc, eq } from "drizzle-orm";
import { getDatabase, isDatabaseConfigured, politicalFilings, politicalSyncStates, politicalTransactions, politicians } from "@/db";
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
      return { id: row.id, sourceId: row.sourceId, politicianId: row.politicianId, politicianName: politician.displayName, chamber: row.chamber, party: row.party, state: row.state, district: row.district, ownerType: row.ownerType, assetName: row.assetName, assetType: row.assetType, sector: row.sector, rawTicker: row.rawTicker, canonicalInstrumentId: row.instrumentId, canonicalIssuerId: row.canonicalIssuerId, symbol: row.symbol, transactionType: row.transactionType, transactionDate: dateOnly(row.transactionDate), disclosureDate: dateOnly(row.disclosureDate), marketAvailableDate: dateOnly(row.marketAvailableDate), disclosureDelayDays: row.disclosureDelayDays, amountMin: numberOrNull(row.amountMin), amountMax: numberOrNull(row.amountMax), amountRangeRaw: row.amountRangeRaw, estimatedAmount: numberOrNull(row.estimatedAmount), amountMethod: row.amountMethod as PoliticalTransaction["amountMethod"], priceAtTransaction: numberOrNull(row.priceAtTransaction), priceAtDisclosure: numberOrNull(row.priceAtDisclosure), currentPrice: numberOrNull(row.currentPrice), sharesEstimate: numberOrNull(row.sharesEstimate), source: row.source, sourceUrl: row.sourceUrl, filingId: row.filingId, filingType: row.filingType, provider: "fmp", fetchedAt: row.fetchedAt.toISOString(), verified: row.verified, verificationStatus: row.verificationStatus, resolutionStatus: row.resolutionStatus as PoliticalTransaction["resolutionStatus"], fingerprint: row.fingerprint, amendment: row.amendment, createdAt: row.createdAt.toISOString(), updatedAt: row.updatedAt.toISOString() };
    });
    const fetchedAt = rows.map(({ transaction }) => transaction.fetchedAt).sort((a, b) => b.getTime() - a.getTime())[0]!.toISOString();
    return { transactions, politicians: [...politicianMap.values()], duplicatesRemoved: 0, duplicateRate: 0, fetchedAt, invalidRecords: 0, status: "AVAILABLE" as const, isLastKnownGood: true };
  } catch (error) { structuredLog("warn", "political.persistence.read_failed", { code: error instanceof Error ? error.name : "UNKNOWN" }); return null; }
}

export async function persistPoliticalTransactions(input: { transactions: PoliticalTransaction[]; politicians: Politician[]; houseRecords: number; senateRecords: number; duplicatesRemoved: number }) {
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
    if (!instrument && transaction.symbol && transaction.resolutionStatus === "RESOLVED") { instrument = await ensureInstrument({ symbol: transaction.symbol, name: transaction.assetName, type: "EQUITY" }).catch(() => undefined); if (instrument) instrumentsBySymbol.set(transaction.symbol, instrument); }
    let filingId: string | null = null;
    const filingSourceId = transaction.filingId ?? transaction.sourceId;
    const [filing] = await database.insert(politicalFilings).values({ politicianId: transaction.politicianId, provider: transaction.provider, sourceId: filingSourceId, filingType: transaction.filingType, disclosureDate: new Date(`${transaction.disclosureDate}T00:00:00Z`), sourceUrl: transaction.sourceUrl, amendment: transaction.amendment, fetchedAt: new Date(transaction.fetchedAt), payload: { sourceId: transaction.sourceId } }).onConflictDoUpdate({ target: [politicalFilings.provider, politicalFilings.sourceId], set: { sourceUrl: transaction.sourceUrl, amendment: transaction.amendment, fetchedAt: new Date(transaction.fetchedAt), updatedAt: new Date() } }).returning({ id: politicalFilings.id });
    filingId = filing?.id ?? (await database.select({ id: politicalFilings.id }).from(politicalFilings).where(eq(politicalFilings.sourceId, filingSourceId)).limit(1))[0]?.id ?? null;
    const values = { sourceId: transaction.sourceId, fingerprint: transaction.fingerprint, politicianId: transaction.politicianId, filingId, instrumentId: instrument?.id ?? null, canonicalIssuerId: instrument?.issuerId ?? null, chamber: transaction.chamber, party: transaction.party, state: transaction.state, district: transaction.district, ownerType: transaction.ownerType, assetName: transaction.assetName, assetType: transaction.assetType, rawTicker: transaction.rawTicker, symbol: transaction.symbol, sector: transaction.sector, transactionType: transaction.transactionType, transactionDate: new Date(`${transaction.transactionDate}T00:00:00Z`), disclosureDate: new Date(`${transaction.disclosureDate}T00:00:00Z`), marketAvailableDate: new Date(`${transaction.marketAvailableDate}T00:00:00Z`), disclosureDelayDays: transaction.disclosureDelayDays, amountMin: numeric(transaction.amountMin), amountMax: numeric(transaction.amountMax), amountRangeRaw: transaction.amountRangeRaw, estimatedAmount: numeric(transaction.estimatedAmount), amountMethod: transaction.amountMethod, priceAtTransaction: numeric(transaction.priceAtTransaction), priceAtDisclosure: numeric(transaction.priceAtDisclosure), currentPrice: numeric(transaction.currentPrice), sharesEstimate: numeric(transaction.sharesEstimate), source: transaction.source, sourceUrl: transaction.sourceUrl, filingType: transaction.filingType, provider: transaction.provider, fetchedAt: new Date(transaction.fetchedAt), verified: transaction.verified, verificationStatus: transaction.verificationStatus, resolutionStatus: transaction.resolutionStatus, amendment: transaction.amendment, rawPayload: { normalizedId: transaction.id } };
    const inserted = await database.insert(politicalTransactions).values(values).onConflictDoUpdate({ target: politicalTransactions.fingerprint, set: { ...values, updatedAt: new Date() } }).returning({ id: politicalTransactions.id });
    if (inserted.length) stored += 1; if (instrument) mapped += 1;
  }
  const latest = input.transactions.map((row) => row.disclosureDate).sort().at(-1); const unresolved = input.transactions.filter((row) => row.resolutionStatus === "UNRESOLVED_ASSET").length;
  await database.insert(politicalSyncStates).values({ key: "fmp-congressional", lastSuccessfulSync: new Date(), houseRecords: input.houseRecords, senateRecords: input.senateRecords, mappedInstruments: mapped, unresolvedAssets: unresolved, duplicatesRemoved: input.duplicatesRemoved, latestDisclosure: latest ? new Date(`${latest}T00:00:00Z`) : null, providerStatus: "OK", metadata: { normalizedRecords: input.transactions.length } }).onConflictDoUpdate({ target: politicalSyncStates.key, set: { lastSuccessfulSync: new Date(), houseRecords: input.houseRecords, senateRecords: input.senateRecords, mappedInstruments: mapped, unresolvedAssets: unresolved, duplicatesRemoved: input.duplicatesRemoved, latestDisclosure: latest ? new Date(`${latest}T00:00:00Z`) : null, providerStatus: "OK", metadata: { normalizedRecords: input.transactions.length }, updatedAt: new Date() } });
  return { persisted: true, transactions: stored, mapped, unresolved };
}

export async function getPoliticalSyncHealth() {
  const empty = { lastSync: null, houseRecords: 0, senateRecords: 0, mappedInstruments: 0, unresolvedAssets: 0, duplicatesRemoved: 0, latestDisclosure: null };
  if (!isDatabaseConfigured()) return { databaseConfigured: false, databaseStatus: "NOT_CONFIGURED", ...empty, fmpStatus: "RUNTIME_ONLY" };
  try {
    const row = (await getDatabase().select().from(politicalSyncStates).where(eq(politicalSyncStates.key, "fmp-congressional")).limit(1))[0];
    return { databaseConfigured: true, databaseStatus: "AVAILABLE", lastSync: row?.lastSuccessfulSync?.toISOString() ?? null, houseRecords: row?.houseRecords ?? 0, senateRecords: row?.senateRecords ?? 0, mappedInstruments: row?.mappedInstruments ?? 0, unresolvedAssets: row?.unresolvedAssets ?? 0, duplicatesRemoved: row?.duplicatesRemoved ?? 0, latestDisclosure: row?.latestDisclosure?.toISOString() ?? null, fmpStatus: row?.providerStatus ?? "NOT_SYNCED" };
  } catch (error) {
    structuredLog("warn", "political.health.persistence_unavailable", { errorType: error instanceof Error ? error.name : "UnknownError" });
    return { databaseConfigured: true, databaseStatus: "UNAVAILABLE", ...empty, fmpStatus: "RUNTIME_ONLY" };
  }
}
