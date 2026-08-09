import type { PoliticalTransaction } from "@/types";

export function politicalTransaction(overrides: Partial<PoliticalTransaction> = {}): PoliticalTransaction {
  const id = overrides.id ?? "tx-1";
  return {
    id, sourceId: `source-${id}`, politicianId: "pol-1", politicianName: "Ada Example", chamber: "HOUSE", party: "DEMOCRATIC", state: "CA", district: "12", ownerType: "SELF", assetName: "Apple Inc.", assetType: "Stock", sector: "Technology", rawTicker: "AAPL", canonicalInstrumentId: "instrument-aapl", canonicalIssuerId: null, symbol: "AAPL", transactionType: "PURCHASE", transactionDate: "2025-01-01", disclosureDate: "2025-01-20", marketAvailableDate: "2025-01-20", disclosureDelayDays: 19, amountMin: 1_001, amountMax: 15_000, amountRangeRaw: "$1,001 - $15,000", estimatedAmount: 8_000.5, amountMethod: "MIDPOINT_ESTIMATE", priceAtTransaction: null, priceAtDisclosure: null, currentPrice: null, sharesEstimate: null, source: "Financial Modeling Prep", sourceUrl: "https://example.test/disclosure", filingId: `filing-${id}`, filingType: "PTR", provider: "fmp", fetchedAt: "2025-01-21T00:00:00.000Z", verified: false, verificationStatus: "PROVIDER_ONLY", resolutionStatus: "RESOLVED", fingerprint: `fingerprint-${id}`, amendment: false, createdAt: "2025-01-21T00:00:00.000Z", updatedAt: "2025-01-21T00:00:00.000Z", ...overrides,
  };
}
