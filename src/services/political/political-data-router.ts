import "server-only";

import { PoliticalClusterEngine, deduplicatePoliticalTransactions } from "@/engines/political";
import { financialProviderRouter } from "@/providers";
import type { PoliticalDisclosure } from "@/providers";
import { normalizeSymbol } from "@/services/yahoo/symbol-resolver";
import type { PoliticalChamber, PoliticalFilters, PoliticalParty, PoliticalTransaction, Politician, ResolvedInstrument } from "@/types";
import { normalizePoliticianName } from "@/engines/political";
import { normalizePoliticalDisclosure } from "./political-normalizer";
import { loadPersistedPoliticalTransactions } from "./political-repository";

interface LoadedPoliticalData { transactions: PoliticalTransaction[]; sourceTransactions?: PoliticalTransaction[]; politicians: Politician[]; duplicatesRemoved: number; duplicateRate: number; fetchedAt: string; invalidRecords: number; }

async function settle<T>(task: Promise<{ data: T; meta: { fetchedAt: string } }>) { try { return await task; } catch { return null; } }

async function resolvePoliticalInstrument(symbol: string): Promise<ResolvedInstrument | null> {
  const result = await financialProviderRouter.profile(symbol).catch(() => null); if (!result) return null;
  const profile = result.data;
  return { canonicalSymbol: symbol, name: profile.name, kind: profile.quoteType.toUpperCase().includes("ETF") ? "ETF" : "EQUITY", exchange: profile.exchange, mic: null, currency: profile.currency, tradingCurrency: profile.currency, countryCode: profile.country, issuer: { legalName: profile.name, countryCode: profile.country, lei: null, cik: null, isin: null, website: profile.website, sector: profile.sector, industry: profile.industry }, mappings: [{ provider: result.meta.provider, symbol, exchangeCode: profile.exchange, providerInstrumentId: null, confidence: .9, verifiedAt: result.meta.fetchedAt }], resolutionQuality: result.meta.quality, warnings: [] };
}

export async function normalizePoliticalRows(rows: PoliticalDisclosure[], fetchedAt: string, options: { resolveInstruments?: boolean; resolutionCache?: Map<string, ResolvedInstrument | null> } = {}): Promise<LoadedPoliticalData> {
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
    if (persisted) return persisted;
    const [house, senate] = await Promise.all([settle(financialProviderRouter.houseTrades(undefined, limit)), settle(financialProviderRouter.senateTrades(undefined, limit))]);
    const rows = [...(house?.data ?? []), ...(senate?.data ?? [])]; const fetchedAt = house?.meta.fetchedAt ?? senate?.meta.fetchedAt ?? new Date().toISOString();
    return normalizePoliticalRows(rows, fetchedAt);
  }

  private async bySymbol(symbolInput: string, limit = 500): Promise<LoadedPoliticalData> {
    const symbol = normalizeSymbol(symbolInput); const persisted = await loadPersistedPoliticalTransactions({ symbol, limit });
    if (persisted) return persisted;
    const [house, senate] = await Promise.all([settle(financialProviderRouter.houseTrades(symbol, limit)), settle(financialProviderRouter.senateTrades(symbol, limit))]);
    if (house || senate) return normalizePoliticalRows([...(house?.data ?? []), ...(senate?.data ?? [])], house?.meta.fetchedAt ?? senate?.meta.fetchedAt ?? new Date().toISOString());
    const latest = await this.latest(Math.min(500, limit));
    return { ...latest, transactions: latest.transactions.filter((row) => row.rawTicker === symbol || row.symbol === symbol) };
  }

  getTradesBySymbol(symbol: string, limit = 500) { return this.bySymbol(symbol, limit); }
  async getTradesByPolitician(nameOrId: string, limit = 500) { const data = await this.latest(limit); const query = nameOrId.toLowerCase(); return { ...data, transactions: data.transactions.filter((row) => row.politicianId === nameOrId || row.politicianName.toLowerCase().includes(query)) }; }
  async getLatestHouseTrades(limit = 100) { const result = await settle(financialProviderRouter.houseTrades(undefined, limit)); return normalizePoliticalRows(result?.data ?? [], result?.meta.fetchedAt ?? new Date().toISOString()); }
  async getLatestSenateTrades(limit = 100) { const result = await settle(financialProviderRouter.senateTrades(undefined, limit)); return normalizePoliticalRows(result?.data ?? [], result?.meta.fetchedAt ?? new Date().toISOString()); }
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
