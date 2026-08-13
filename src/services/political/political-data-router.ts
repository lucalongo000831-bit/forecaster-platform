import "server-only";

import { PoliticalClusterEngine, deduplicatePoliticalTransactions } from "@/engines/political";
import { financialProviderRouter } from "@/providers";
import type { PoliticalDisclosure } from "@/providers";
import { normalizeProviderError } from "@/providers/errors";
import { normalizeSymbol } from "@/services/yahoo/symbol-resolver";
import type { PoliticalAssetContext, PoliticalAssetProvenance, PoliticalChamber, PoliticalFilters, PoliticalParty, PoliticalTransaction, Politician, ResolvedInstrument } from "@/types";
import { normalizePoliticianName } from "@/engines/political";
import { normalizePoliticalDisclosure } from "./political-normalizer";
import { loadPersistedPoliticalTransactions, loadPoliticalTransactionsForAsset } from "./political-repository";
import { resolvePoliticalAssetContext } from "./political-asset-resolver";
import { politicalTransactionMatchesContext } from "./political-asset-state";

export interface LoadedPoliticalData {
  transactions: PoliticalTransaction[];
  sourceTransactions?: PoliticalTransaction[];
  politicians: Politician[];
  duplicatesRemoved: number;
  duplicateRate: number;
  fetchedAt: string;
  invalidRecords: number;
  assetContext?: PoliticalAssetContext;
  provenance: PoliticalAssetProvenance;
}

async function settle<T>(task: Promise<{ data: T; meta: { fetchedAt: string; provider: string } }>) { try { return await task; } catch { return null; } }

const databaseProvenance = (databaseStatus: PoliticalAssetProvenance["databaseStatus"], providers: string[] = []): PoliticalAssetProvenance => ({
  sourceMode: databaseStatus === "AVAILABLE" ? "DATABASE" : providers.length ? "PROVIDER_FALLBACK" : "UNAVAILABLE",
  providers,
  databaseUsed: databaseStatus === "AVAILABLE",
  fallbackUsed: databaseStatus !== "AVAILABLE" && providers.length > 0,
  databaseStatus,
  providerAttempts: [],
  lastSuccessfulSync: null,
});

async function providerAttempt(task: ReturnType<typeof financialProviderRouter.houseTrades>) {
  try {
    const result = await task;
    return {
      result,
      attempt: { provider: result.meta.provider, status: result.data.length ? "REQUEST_SUCCESS_WITH_DATA" as const : "REQUEST_SUCCESS_EMPTY" as const, records: result.data.length },
    };
  } catch (error) {
    const normalized = normalizeProviderError("fmp", error);
    return {
      result: null,
      attempt: { provider: normalized.provider, status: normalized.code === "RATE_LIMITED" ? "RATE_LIMITED" as const : "SOURCE_UNAVAILABLE" as const, records: 0 },
    };
  }
}

async function resolvePoliticalInstrument(symbol: string): Promise<ResolvedInstrument | null> {
  const result = await financialProviderRouter.profile(symbol).catch(() => null); if (!result) return null;
  const profile = result.data;
  return { canonicalSymbol: symbol, name: profile.name, kind: profile.quoteType.toUpperCase().includes("ETF") ? "ETF" : "EQUITY", exchange: profile.exchange, mic: null, currency: profile.currency, tradingCurrency: profile.currency, countryCode: profile.country, issuer: { legalName: profile.name, countryCode: profile.country, lei: null, cik: null, isin: null, website: profile.website, sector: profile.sector, industry: profile.industry }, mappings: [{ provider: result.meta.provider, symbol, exchangeCode: profile.exchange, providerInstrumentId: null, confidence: .9, verifiedAt: result.meta.fetchedAt }], resolutionQuality: result.meta.quality, warnings: [] };
}

export async function normalizePoliticalRows(rows: PoliticalDisclosure[], fetchedAt: string, options: { resolveInstruments?: boolean; resolutionCache?: Map<string, ResolvedInstrument | null> } = {}): Promise<Omit<LoadedPoliticalData, "provenance">> {
  const symbols = [...new Set(rows.map((row) => row.symbol?.trim().toUpperCase()).filter((symbol): symbol is string => Boolean(symbol && /^[A-Z0-9.^=-]{1,32}$/.test(symbol))))];
  const resolutions = options.resolutionCache ?? new Map<string, ResolvedInstrument | null>();
  if (options.resolveInstruments !== false) for (let index = 0; index < symbols.length; index += 8) {
    const batch = symbols.slice(index, index + 8).filter((symbol) => !resolutions.has(symbol));
    const resolved = await Promise.all(batch.map(resolvePoliticalInstrument));
    batch.forEach((symbol, position) => resolutions.set(symbol, resolved[position] ?? null));
  }
  const mapped = rows.map((row) => normalizePoliticalDisclosure(row, fetchedAt, row.symbol ? resolutions.get(row.symbol.toUpperCase()) ?? null : null));
  const invalidRecords = mapped.filter((row) => !row).length; const normalized = mapped.filter((row): row is PoliticalTransaction => Boolean(row));
  const deduped = deduplicatePoliticalTransactions(normalized); const politicianMap = new Map<string, Politician>();
  for (const transaction of deduped.data) {
    if (politicianMap.has(transaction.politicianId)) continue;
    const name = normalizePoliticianName(transaction.politicianName);
    politicianMap.set(transaction.politicianId, { id: transaction.politicianId, normalizedName: name.normalizedName, displayName: transaction.politicianName, chamber: transaction.chamber, party: transaction.party, state: transaction.state, district: transaction.district, activeStatus: "UNKNOWN", sourceIdentifiers: { [transaction.provider]: transaction.sourceId }, createdAt: transaction.createdAt, updatedAt: transaction.updatedAt });
  }
  return { transactions: deduped.data, sourceTransactions: deduped.sourceRows, politicians: [...politicianMap.values()], duplicatesRemoved: deduped.duplicatesRemoved, duplicateRate: deduped.duplicateRate, fetchedAt, invalidRecords };
}

function filterTransactions(transactions: PoliticalTransaction[], filters: PoliticalFilters) {
  const normalizedSymbol = filters.symbol ? normalizeSymbol(filters.symbol) : null; const query = filters.query?.toLowerCase().trim();
  return transactions.filter((row) => {
    if (normalizedSymbol && row.symbol !== normalizedSymbol) return false;
    if (filters.chamber && filters.chamber !== "ALL" && row.chamber !== filters.chamber) return false;
    if (filters.party && filters.party !== "ALL" && row.party !== filters.party) return false;
    if (filters.transactionType && filters.transactionType !== "ALL" && row.transactionType !== filters.transactionType) return false;
    if (filters.ownerType && filters.ownerType !== "ALL" && row.ownerType !== filters.ownerType) return false;
    if (filters.sector && row.sector !== filters.sector) return false;
    if (filters.politician && !row.politicianName.toLowerCase().includes(filters.politician.toLowerCase())) return false;
    if (query && ![row.politicianName, row.symbol, row.assetName].some((value) => value?.toLowerCase().includes(query))) return false;
    return true;
  });
}

export class PoliticalDataRouter {
  private async latest(limit = 100): Promise<LoadedPoliticalData> {
    const persisted = await loadPersistedPoliticalTransactions({ limit });
    if (persisted) return { ...persisted, provenance: databaseProvenance("AVAILABLE", [...new Set(persisted.transactions.map((row) => row.provider))]) };
    const [house, senate] = await Promise.all([settle(financialProviderRouter.houseTrades(undefined, limit)), settle(financialProviderRouter.senateTrades(undefined, limit))]);
    const rows = [...(house?.data ?? []), ...(senate?.data ?? [])]; const fetchedAt = house?.meta.fetchedAt ?? senate?.meta.fetchedAt ?? new Date().toISOString();
    return { ...(await normalizePoliticalRows(rows, fetchedAt)), provenance: databaseProvenance("UNAVAILABLE", [...new Set([house?.meta.provider, senate?.meta.provider].filter((value): value is string => Boolean(value)))]) };
  }

  async getTradesByAssetContext(context: PoliticalAssetContext, limit = 2_000): Promise<LoadedPoliticalData> {
    const persisted = await loadPoliticalTransactionsForAsset(context, limit);
    if (persisted.databaseStatus === "AVAILABLE") {
      return { ...persisted, assetContext: context, duplicatesRemoved: 0, duplicateRate: 0, invalidRecords: 0, provenance: databaseProvenance("AVAILABLE", [...new Set(persisted.transactions.map((row) => row.provider))]) };
    }

    const fmpSymbol = context.providerMappings.find((mapping) => mapping.provider === "fmp")?.symbol ?? context.requestedSymbol;
    const [house, senate] = await Promise.all([
      providerAttempt(financialProviderRouter.houseTrades(fmpSymbol, limit)),
      providerAttempt(financialProviderRouter.senateTrades(fmpSymbol, limit)),
    ]);
    const rawRows = [...(house.result?.data ?? []), ...(senate.result?.data ?? [])];
    const normalized = await normalizePoliticalRows(rawRows, house.result?.meta.fetchedAt ?? senate.result?.meta.fetchedAt ?? new Date().toISOString());
    const transactions = normalized.transactions.filter((row) => politicalTransactionMatchesContext(row, context));
    const attempts = [house.attempt, senate.attempt];
    const providers = [...new Set(attempts.map((attempt) => attempt.provider))];
    return {
      ...normalized,
      transactions,
      assetContext: context,
      provenance: {
        sourceMode: providers.length ? "PROVIDER_FALLBACK" : "UNAVAILABLE",
        providers,
        databaseUsed: false,
        fallbackUsed: true,
        databaseStatus: persisted.databaseStatus,
        providerAttempts: attempts,
        lastSuccessfulSync: null,
      },
    };
  }

  private async bySymbol(symbolInput: string, limit = 2_000): Promise<LoadedPoliticalData> {
    const context = await resolvePoliticalAssetContext(normalizeSymbol(symbolInput));
    return this.getTradesByAssetContext(context, limit);
  }

  getTradesBySymbol(symbol: string, limit = 500) { return this.bySymbol(symbol, limit); }
  async getTradesByPolitician(nameOrId: string, limit = 500) { const data = await this.latest(limit); const query = nameOrId.toLowerCase(); return { ...data, transactions: data.transactions.filter((row) => row.politicianId === nameOrId || row.politicianName.toLowerCase().includes(query)) }; }
  async getLatestHouseTrades(limit = 100) { const result = await settle(financialProviderRouter.houseTrades(undefined, limit)); return { ...(await normalizePoliticalRows(result?.data ?? [], result?.meta.fetchedAt ?? new Date().toISOString())), provenance: databaseProvenance("UNAVAILABLE", result ? [result.meta.provider] : []) }; }
  async getLatestSenateTrades(limit = 100) { const result = await settle(financialProviderRouter.senateTrades(undefined, limit)); return { ...(await normalizePoliticalRows(result?.data ?? [], result?.meta.fetchedAt ?? new Date().toISOString())), provenance: databaseProvenance("UNAVAILABLE", result ? [result.meta.provider] : []) }; }
  async getTradesByDateRange(from: string, to: string, limit = 500) { const data = await this.latest(limit); return { ...data, transactions: data.transactions.filter((row) => row.disclosureDate >= from && row.disclosureDate <= to) }; }
  async getTradesByAsset(query: string, limit = 500) { const data = await this.latest(limit); const normalized = query.toLowerCase(); return { ...data, transactions: data.transactions.filter((row) => row.symbol?.toLowerCase() === normalized || row.assetName.toLowerCase().includes(normalized)) }; }
  async getTradesByParty(party: PoliticalParty, limit = 500) { const data = await this.latest(limit); return { ...data, transactions: data.transactions.filter((row) => row.party === party) }; }
  async getTradesByChamber(chamber: PoliticalChamber, limit = 500) { const data = await this.latest(limit); return { ...data, transactions: data.transactions.filter((row) => row.chamber === chamber) }; }
  async getTradeHistory(filters: PoliticalFilters = {}) { const data = filters.symbol ? await this.bySymbol(filters.symbol, 500) : await this.latest(500); return { ...data, transactions: filterTransactions(data.transactions, filters) }; }
  getPoliticianActivity(nameOrId: string) { return this.getTradesByPolitician(nameOrId); }
  getSymbolPoliticalActivity(symbol: string) { return this.getTradesBySymbol(symbol); }
  async getPoliticalLeaderboard(filters: PoliticalFilters = {}) { return this.getTradeHistory(filters); }
  async getClusterActivity(filters: PoliticalFilters = {}, windowDays = 30) { const data = await this.getTradeHistory(filters); return new PoliticalClusterEngine(windowDays).analyze(data.transactions); }
}

export const politicalDataRouter = new PoliticalDataRouter();
