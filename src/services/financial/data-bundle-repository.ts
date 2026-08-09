import "server-only";

import { analysisDataBundleSnapshots, fieldProvenanceSnapshots, getDatabase, instruments, isDatabaseConfigured, issuers } from "@/db";
import { structuredLog } from "@/lib/server/logger";
import type { AnalysisDataBundle, CryptoDataBundle, EtfDataBundle, ResolvedInstrument } from "@/types";

type Bundle = AnalysisDataBundle | EtfDataBundle | CryptoDataBundle;

async function ensureInstrument(identity: ResolvedInstrument) {
  const database = getDatabase(); let issuerId: string | null = null;
  if (identity.issuer) {
    const issuerValues = { legalName: identity.issuer.legalName, countryCode: identity.issuer.countryCode, lei: identity.issuer.lei, cik: identity.issuer.cik, primaryIsin: identity.issuer.isin, website: identity.issuer.website, sector: identity.issuer.sector, industry: identity.issuer.industry, identifiers: Object.fromEntries([["cik", identity.issuer.cik], ["lei", identity.issuer.lei], ["isin", identity.issuer.isin]].filter((entry): entry is [string, string] => Boolean(entry[1]))) };
    const existingTarget = identity.issuer.cik ? issuers.cik : identity.issuer.lei ? issuers.lei : null;
    if (existingTarget) {
      const [record] = await database.insert(issuers).values(issuerValues).onConflictDoUpdate({ target: existingTarget, set: { ...issuerValues, updatedAt: new Date() } }).returning({ id: issuers.id }); issuerId = record.id;
    } else {
      const [record] = await database.insert(issuers).values(issuerValues).returning({ id: issuers.id }); issuerId = record.id;
    }
  }
  const slug = `${identity.exchange ?? "market"}-${identity.canonicalSymbol}`.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
  const providerSymbols = Object.fromEntries(identity.mappings.map((mapping) => [mapping.provider, { symbol: mapping.symbol, exchangeCode: mapping.exchangeCode, providerInstrumentId: mapping.providerInstrumentId }]));
  const [record] = await database.insert(instruments).values({ issuerId, canonicalSymbol: identity.canonicalSymbol, name: identity.name, slug, type: identity.kind, currency: identity.currency, market: identity.exchange, countryCode: identity.countryCode, sector: identity.issuer?.sector, industry: identity.issuer?.industry, isin: identity.issuer?.isin, providerSymbols, active: true }).onConflictDoUpdate({ target: instruments.slug, set: { issuerId, name: identity.name, currency: identity.currency, market: identity.exchange, providerSymbols, updatedAt: new Date() } }).returning({ id: instruments.id });
  return record.id;
}

export async function persistDataBundle(bundleType: "COMPANY" | "ETF" | "CRYPTO", bundle: Bundle) {
  if (!isDatabaseConfigured()) return null;
  try {
    const database = getDatabase(); const instrumentId = await ensureInstrument(bundle.instrument);
    const [snapshot] = await database.insert(analysisDataBundleSnapshots).values({ instrumentId, bundleType, payload: bundle as unknown as Record<string, unknown>, provenance: bundle.provenance as unknown as Array<Record<string, unknown>>, missingData: bundle.missing as unknown as Array<Record<string, unknown>>, dataTimestamp: new Date(bundle.calculatedAt), expiresAt: new Date(Date.now() + (bundleType === "CRYPTO" ? 1_800_000 : 21_600_000)) }).returning({ id: analysisDataBundleSnapshots.id });
    if (bundle.provenance.length) await database.insert(fieldProvenanceSnapshots).values(bundle.provenance.map((item) => ({ instrumentId, fieldPath: item.field, provider: item.provider, quality: item.quality, sourceTimestamp: item.sourceTimestamp ? new Date(item.sourceTimestamp) : null, formula: item.formula, inputs: item.inputs ?? [], metadata: { currency: item.currency, unit: item.unit, missingReason: item.missingReason } })));
    return snapshot.id;
  } catch (error) { structuredLog("warn", "data_bundle.persistence_failed", { bundleType, symbol: bundle.instrument.canonicalSymbol, code: error instanceof Error ? error.name : "UNKNOWN" }); return null; }
}
