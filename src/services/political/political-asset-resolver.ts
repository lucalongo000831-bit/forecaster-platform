import "server-only";

import { and, eq, inArray } from "drizzle-orm";
import { getDatabase, instrumentSymbols, instruments, isDatabaseConfigured, issuers, politicalAssetAliases } from "@/db";
import { structuredLog } from "@/lib/server/logger";
import { resolveInstrument } from "@/services/instruments/instrument-resolver";
import { verifiedInstrumentKind } from "@/services/instruments/instrument-kind";
import { verifiedIssuerByListing } from "@/services/instruments/verified-issuer-registry";
import { normalizeSymbol } from "@/services/yahoo/symbol-resolver";
import type { InstrumentKind, PoliticalAssetContext, ProviderSymbolMapping, ResolvedInstrument } from "@/types";

const marketSymbolProviders = new Set(["yahoo", "fmp", "eodhd", "finnhub", "massive"]);

function uniqueSymbols(values: Array<string | null | undefined>) {
  return [...new Set(values.flatMap((value) => {
    if (!value) return [];
    try { return [normalizeSymbol(value)]; } catch { return []; }
  }))];
}

function registryAliases(symbol: string) {
  const verified = verifiedIssuerByListing(symbol);
  return verified ? uniqueSymbols(verified.listings.flatMap((listing) => [listing.symbol, listing.providerSymbol])) : [];
}

function mappingAliases(mappings: ProviderSymbolMapping[]) {
  return uniqueSymbols(mappings.filter((mapping) => marketSymbolProviders.has(mapping.provider)).map((mapping) => mapping.symbol));
}

function cacheIdentity(assetClass: InstrumentKind, instrumentId: string | null, issuerId: string | null, canonicalSymbol: string) {
  if (assetClass === "EQUITY" && issuerId) return `issuer:${issuerId}`;
  if (instrumentId) return `${assetClass === "CRYPTO" ? "crypto" : "instrument"}:${instrumentId}`;
  return `${assetClass === "CRYPTO" ? "crypto" : "symbol"}:${canonicalSymbol}`;
}

function databaseCountryCode(identity: ResolvedInstrument) {
  const value = identity.issuer?.countryCode ?? identity.countryCode;
  return value && /^[A-Z]{2}$/i.test(value) ? value.toUpperCase() : null;
}

async function findDatabaseInstrument(symbol: string, aliases: string[]) {
  if (!isDatabaseConfigured()) return null;
  const database = getDatabase();
  const candidates = uniqueSymbols([symbol, ...aliases]);
  const direct = await database.select({ instrument: instruments, issuer: issuers }).from(instruments)
    .leftJoin(issuers, eq(instruments.issuerId, issuers.id))
    .where(inArray(instruments.canonicalSymbol, candidates)).limit(20);
  const preferred = direct.sort((left, right) => Number(right.instrument.canonicalSymbol === symbol) - Number(left.instrument.canonicalSymbol === symbol) || Number(Boolean(right.instrument.issuerId)) - Number(Boolean(left.instrument.issuerId)))[0];
  if (preferred) return preferred;

  const providerMatch = await database.select({ instrument: instruments, issuer: issuers }).from(instrumentSymbols)
    .innerJoin(instruments, eq(instrumentSymbols.instrumentId, instruments.id))
    .leftJoin(issuers, eq(instruments.issuerId, issuers.id))
    .where(inArray(instrumentSymbols.symbol, candidates)).limit(1);
  if (providerMatch[0]) return providerMatch[0];

  const normalizedAlias = symbol.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
  const aliasMatch = await database.select({ instrument: instruments, issuer: issuers }).from(politicalAssetAliases)
    .innerJoin(instruments, eq(politicalAssetAliases.instrumentId, instruments.id))
    .leftJoin(issuers, eq(instruments.issuerId, issuers.id))
    .where(and(eq(politicalAssetAliases.normalizedAlias, normalizedAlias), eq(politicalAssetAliases.active, true))).limit(1);
  return aliasMatch[0] ?? null;
}

async function aliasesForIssuer(issuerId: string) {
  const rows = await getDatabase().select({ symbol: instruments.canonicalSymbol }).from(instruments).where(eq(instruments.issuerId, issuerId));
  return rows.map((row) => row.symbol);
}

function contextFromResolved(requestedSymbol: string, resolved: ResolvedInstrument, instrumentId: string | null, issuerId: string | null, extraAliases: string[] = []): PoliticalAssetContext {
  const aliases = uniqueSymbols([requestedSymbol, resolved.canonicalSymbol, ...registryAliases(requestedSymbol), ...mappingAliases(resolved.mappings), ...extraAliases]);
  const matchStrategy = resolved.kind === "EQUITY" && issuerId ? "CANONICAL_ISSUER" : instrumentId ? "CANONICAL_INSTRUMENT" : resolved.resolutionQuality !== "unavailable" ? "CANONICAL_SYMBOL" : "UNRESOLVED";
  return { requestedSymbol, canonicalSymbol: resolved.canonicalSymbol, assetClass: resolved.kind, instrumentId, issuerId, aliases, providerMappings: resolved.mappings, resolutionQuality: resolved.resolutionQuality, cacheIdentity: cacheIdentity(resolved.kind, instrumentId, issuerId, resolved.canonicalSymbol), matchStrategy };
}

export async function resolvePoliticalAssetContext(symbolInput: string): Promise<PoliticalAssetContext> {
  const startedAt = Date.now();
  const requestedSymbol = normalizeSymbol(decodeURIComponent(symbolInput));
  const registry = registryAliases(requestedSymbol);
  try {
    const stored = await findDatabaseInstrument(requestedSymbol, registry);
    if (stored) {
      const kind = verifiedInstrumentKind(stored.instrument.canonicalSymbol, stored.instrument.type, stored.instrument.name) ?? stored.instrument.type;
      const issuerId = kind === "EQUITY" ? stored.instrument.issuerId : null;
      const issuerAliases = issuerId ? await aliasesForIssuer(issuerId) : [];
      const providerMappings = Object.entries(stored.instrument.providerSymbols ?? {}).flatMap(([provider, mapping]) => mapping?.symbol ? [{ provider: provider as ProviderSymbolMapping["provider"], symbol: mapping.symbol, exchangeCode: mapping.exchangeCode ?? null, providerInstrumentId: mapping.providerInstrumentId ?? null, confidence: 1, verifiedAt: stored.instrument.updatedAt.toISOString() }] : []);
      const resolved: ResolvedInstrument = { canonicalSymbol: stored.instrument.canonicalSymbol, name: stored.instrument.name, kind, exchange: stored.instrument.market, mic: null, currency: stored.instrument.currency, tradingCurrency: stored.instrument.currency, countryCode: stored.instrument.countryCode, issuer: kind === "EQUITY" && stored.issuer ? { id: stored.issuer.id, legalName: stored.issuer.legalName, countryCode: stored.issuer.countryCode, lei: stored.issuer.lei, cik: stored.issuer.cik, isin: stored.issuer.primaryIsin, website: stored.issuer.website, sector: stored.issuer.sector, industry: stored.issuer.industry } : null, mappings: providerMappings, resolutionQuality: "verified", warnings: [] };
      const context = contextFromResolved(requestedSymbol, resolved, stored.instrument.id, issuerId, issuerAliases);
      structuredLog("info", "political.asset.resolve", { requestedSymbol, canonicalSymbol: context.canonicalSymbol, assetClass: context.assetClass, instrumentId: context.instrumentId, issuerId: context.issuerId, status: context.matchStrategy, durationMs: Date.now() - startedAt });
      return context;
    }
  } catch (error) {
    structuredLog("warn", "political.asset.resolve.db_failed", { requestedSymbol, code: error instanceof Error ? error.name : "UNKNOWN" });
  }

  const resolved = await resolveInstrument(requestedSymbol).catch((): ResolvedInstrument => ({ canonicalSymbol: requestedSymbol, name: requestedSymbol, kind: requestedSymbol.endsWith("-USD") ? "CRYPTO" : "EQUITY", exchange: null, mic: null, currency: null, tradingCurrency: null, countryCode: null, issuer: null, mappings: [], resolutionQuality: "unavailable", warnings: ["Canonical resolution unavailable."] }));
  const context = contextFromResolved(requestedSymbol, resolved, null, null);
  structuredLog(context.matchStrategy === "UNRESOLVED" ? "warn" : "info", context.matchStrategy === "UNRESOLVED" ? "political.asset.unresolved" : "political.asset.resolve", { requestedSymbol, canonicalSymbol: context.canonicalSymbol, assetClass: context.assetClass, instrumentId: null, issuerId: null, status: context.matchStrategy, durationMs: Date.now() - startedAt });
  return context;
}

async function upsertIssuer(identity: ResolvedInstrument) {
  if (!identity.issuer) return null;
  const database = getDatabase();
  const values = { legalName: identity.issuer.legalName, countryCode: identity.issuer.countryCode, lei: identity.issuer.lei, cik: identity.issuer.cik, primaryIsin: identity.issuer.isin, website: identity.issuer.website, sector: identity.issuer.sector, industry: identity.issuer.industry, identifiers: Object.fromEntries([["cik", identity.issuer.cik], ["lei", identity.issuer.lei], ["isin", identity.issuer.isin]].filter((item): item is [string, string] => Boolean(item[1]))) };
  const condition = identity.issuer.cik ? eq(issuers.cik, identity.issuer.cik) : identity.issuer.lei ? eq(issuers.lei, identity.issuer.lei) : eq(issuers.legalName, identity.issuer.legalName);
  const [existing] = await database.select({ id: issuers.id }).from(issuers).where(condition).limit(1);
  if (existing) { await database.update(issuers).set({ ...values, updatedAt: new Date() }).where(eq(issuers.id, existing.id)); return existing.id; }
  return (await database.insert(issuers).values(values).returning({ id: issuers.id }))[0]?.id ?? null;
}

export async function ensurePoliticalAssetContext(symbolInput: string, expectedKind?: InstrumentKind): Promise<PoliticalAssetContext> {
  const requestedSymbol = normalizeSymbol(decodeURIComponent(symbolInput));
  if (!isDatabaseConfigured()) return resolvePoliticalAssetContext(requestedSymbol);
  const identity = await resolveInstrument(requestedSymbol);
  const kind = expectedKind ?? identity.kind;
  const issuerId = kind === "EQUITY" ? await upsertIssuer(identity) : null;
  const database = getDatabase();
  const providerSymbols = Object.fromEntries(identity.mappings.map((mapping) => [mapping.provider, { symbol: mapping.symbol, exchangeCode: mapping.exchangeCode, providerInstrumentId: mapping.providerInstrumentId }]));
  const [existing] = await database.select().from(instruments).where(eq(instruments.canonicalSymbol, identity.canonicalSymbol)).limit(1);
  let instrumentId: string;
  if (existing) {
    await database.update(instruments).set({ issuerId, name: identity.name, type: kind, currency: identity.currency, market: identity.exchange, countryCode: databaseCountryCode(identity), sector: identity.issuer?.sector ?? existing.sector, industry: identity.issuer?.industry ?? existing.industry, isin: identity.issuer?.isin ?? existing.isin, providerSymbols, updatedAt: new Date() }).where(eq(instruments.id, existing.id));
    instrumentId = existing.id;
  } else {
    const slug = identity.canonicalSymbol.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
    const [created] = await database.insert(instruments).values({ issuerId, canonicalSymbol: identity.canonicalSymbol, name: identity.name, slug, type: kind, currency: identity.currency, market: identity.exchange, countryCode: databaseCountryCode(identity), sector: identity.issuer?.sector, industry: identity.issuer?.industry, isin: identity.issuer?.isin, providerSymbols, active: true }).onConflictDoUpdate({ target: instruments.slug, set: { issuerId, name: identity.name, type: kind, providerSymbols, updatedAt: new Date() } }).returning({ id: instruments.id });
    instrumentId = created!.id;
  }
  return contextFromResolved(requestedSymbol, { ...identity, kind }, instrumentId, issuerId, issuerId ? await aliasesForIssuer(issuerId) : []);
}
