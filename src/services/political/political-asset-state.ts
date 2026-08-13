import type { PoliticalAssetContext, PoliticalAssetDataStatus, PoliticalAssetProvenance, PoliticalDatasetCoverage, PoliticalTransaction } from "@/types";
import { normalizeSymbol } from "@/services/yahoo/symbol-resolver";

export function derivePoliticalAssetDataStatus(input: { recordCount: number; context: PoliticalAssetContext; provenance: PoliticalAssetProvenance; coverage: PoliticalDatasetCoverage }): PoliticalAssetDataStatus {
  if (input.context.matchStrategy === "UNRESOLVED") return "UNRESOLVED_ASSET";
  if (input.recordCount > 0) return "HAS_ACTIVITY";
  if (input.provenance.databaseStatus === "AVAILABLE" && input.coverage.status === "VERIFIED_ZERO") return "VERIFIED_ZERO";
  const providerUnavailable = input.provenance.providerAttempts.length > 0 && input.provenance.providerAttempts.every((attempt) => attempt.status === "RATE_LIMITED" || attempt.status === "SOURCE_UNAVAILABLE");
  if (input.provenance.databaseStatus === "UNAVAILABLE" && providerUnavailable) return "SOURCE_TEMPORARILY_UNAVAILABLE";
  if (input.provenance.databaseStatus === "NOT_CONFIGURED" && providerUnavailable) return "DATABASE_UNAVAILABLE";
  return "PARTIAL_DATA";
}

export function politicalAssetCacheKey(cacheIdentity: string, period: string) {
  return `political-intelligence:v3.1:${cacheIdentity}:${period}`;
}

export function politicalTransactionMatchesContext(transaction: Pick<PoliticalTransaction, "canonicalInstrumentId" | "canonicalIssuerId" | "symbol" | "rawTicker">, context: PoliticalAssetContext) {
  if (context.assetClass === "EQUITY" && context.issuerId && transaction.canonicalIssuerId === context.issuerId) return true;
  if (context.instrumentId && transaction.canonicalInstrumentId === context.instrumentId) return true;
  const aliases = new Set(context.aliases);
  return [transaction.symbol, transaction.rawTicker].filter((value): value is string => Boolean(value)).some((value) => {
    try { return aliases.has(normalizeSymbol(value)); } catch { return aliases.has(value.toUpperCase()); }
  });
}
