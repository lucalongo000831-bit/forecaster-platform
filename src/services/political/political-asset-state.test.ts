import { describe, expect, it } from "vitest";
import type { PoliticalAssetContext, PoliticalAssetProvenance, PoliticalDatasetCoverage } from "@/types";
import { derivePoliticalAssetDataStatus, politicalAssetCacheKey, politicalTransactionMatchesContext } from "./political-asset-state";

const context: PoliticalAssetContext = { requestedSymbol: "AAPL", canonicalSymbol: "AAPL", assetClass: "EQUITY", instrumentId: "instrument-aapl", issuerId: "issuer-apple", aliases: ["AAPL"], providerMappings: [], resolutionQuality: "verified", cacheIdentity: "issuer:issuer-apple", matchStrategy: "CANONICAL_ISSUER" };
const provenance: PoliticalAssetProvenance = { sourceMode: "DATABASE", providers: ["capitol-exposed"], databaseUsed: true, fallbackUsed: false, databaseStatus: "AVAILABLE", providerAttempts: [], lastSuccessfulSync: "2026-08-13T00:00:00.000Z" };
const coverage: PoliticalDatasetCoverage = { status: "VERIFIED_ZERO", requestedFrom: "2026-05-15", requestedTo: "2026-08-13", historyFrom: "2025-08-01", historyTo: "2026-08-13", historyCoveragePercent: 100, mappingRate: 99, ingestedRecords: 6_932, sourceHealthy: true, isLastKnownGood: false, reason: "healthy", suggestedPeriod: null };

describe("political asset result semantics", () => {
  it("reports activity whenever attributable records exist", () => expect(derivePoliticalAssetDataStatus({ recordCount: 1, context, provenance, coverage })).toBe("HAS_ACTIVITY"));
  it("allows verified zero only from the available canonical database", () => expect(derivePoliticalAssetDataStatus({ recordCount: 0, context, provenance, coverage })).toBe("VERIFIED_ZERO"));
  it("does not treat an HTTP-success empty fallback as verified zero", () => expect(derivePoliticalAssetDataStatus({ recordCount: 0, context, provenance: { ...provenance, sourceMode: "PROVIDER_FALLBACK", databaseUsed: false, fallbackUsed: true, databaseStatus: "UNAVAILABLE", providerAttempts: [{ provider: "fmp", status: "REQUEST_SUCCESS_EMPTY", records: 0 }] }, coverage })).toBe("PARTIAL_DATA"));
  it("surfaces a simultaneous database and provider outage", () => expect(derivePoliticalAssetDataStatus({ recordCount: 0, context, provenance: { ...provenance, sourceMode: "UNAVAILABLE", databaseUsed: false, fallbackUsed: true, databaseStatus: "UNAVAILABLE", providerAttempts: [{ provider: "fmp", status: "RATE_LIMITED", records: 0 }] }, coverage })).toBe("SOURCE_TEMPORARILY_UNAVAILABLE"));
  it("uses one cache identity for issuer-equivalent listings", () => {
    expect(politicalAssetCacheKey("issuer:stellantis", "1Y")).toBe(politicalAssetCacheKey("issuer:stellantis", "1Y"));
    expect(politicalAssetCacheKey("issuer:stellantis", "1Y")).not.toBe(politicalAssetCacheKey("instrument:stlam", "1Y"));
  });

  it("matches a secondary listing through the canonical issuer", () => {
    expect(politicalTransactionMatchesContext({ canonicalInstrumentId: "stla", canonicalIssuerId: "issuer-apple", symbol: "STLA", rawTicker: "STLA" }, context)).toBe(true);
  });

  it("keeps ETF and crypto matching on the disclosed direct instrument", () => {
    const bitcoin = { ...context, assetClass: "CRYPTO" as const, instrumentId: "btc", issuerId: null, aliases: ["BTC-USD"], matchStrategy: "CANONICAL_INSTRUMENT" as const };
    const ibit = { ...context, assetClass: "ETF" as const, instrumentId: "ibit", issuerId: null, aliases: ["IBIT"], matchStrategy: "CANONICAL_INSTRUMENT" as const };
    expect(politicalTransactionMatchesContext({ canonicalInstrumentId: "btc", canonicalIssuerId: null, symbol: "BTC-USD", rawTicker: "BTC" }, bitcoin)).toBe(true);
    expect(politicalTransactionMatchesContext({ canonicalInstrumentId: "ibit", canonicalIssuerId: null, symbol: "IBIT", rawTicker: "IBIT" }, bitcoin)).toBe(false);
    expect(politicalTransactionMatchesContext({ canonicalInstrumentId: "btc", canonicalIssuerId: null, symbol: "BTC-USD", rawTicker: "BTC" }, ibit)).toBe(false);
  });
});
