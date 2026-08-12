import { describe, expect, it } from "vitest";
import type { PoliticalDisclosure } from "@/providers";
import type { ResolvedInstrument } from "@/types";
import { normalizePoliticalDisclosure, resolveDirectCryptoAlias } from "./political-normalizer";

const disclosure = (overrides: Partial<PoliticalDisclosure> = {}): PoliticalDisclosure => ({
  id: "row-1", sourceId: "source-1", politician: "Ada Example", chamber: "HOUSE", party: null,
  state: null, district: null, symbol: null, asset: "Bitcoin", assetType: "Cryptocurrency",
  transactionType: "PURCHASE", rawTransactionType: "Purchase", transactionDate: "2026-01-01",
  disclosureDate: "2026-01-20", amountRange: "$1,001 - $15,000", ownership: null,
  capitalGains: null, sourceUrl: null, filingId: null, filingType: null, amendment: false, ...overrides,
});

const etf: ResolvedInstrument = {
  canonicalSymbol: "IBIT", name: "iShares Bitcoin Trust ETF", kind: "ETF", exchange: "NASDAQ",
  mic: "XNAS", currency: "USD", tradingCurrency: "USD", countryCode: "US", issuer: null,
  mappings: [], resolutionQuality: "verified", warnings: [],
};

describe("political asset aliases", () => {
  it("resolves direct Bitcoin text to the canonical crypto asset", () => {
    expect(resolveDirectCryptoAlias("Bitcoin", "Cryptocurrency", null)).toBe("BTC-USD");
    expect(normalizePoliticalDisclosure(disclosure(), "2026-01-21T00:00:00.000Z")?.symbol).toBe("BTC-USD");
  });

  it("never resolves a Bitcoin ETF or trust as direct Bitcoin", () => {
    expect(resolveDirectCryptoAlias("iShares Bitcoin Trust ETF", "ETF", null)).toBeNull();
    const normalized = normalizePoliticalDisclosure(disclosure({ symbol: "IBIT", asset: "iShares Bitcoin Trust ETF", assetType: "ETF" }), "2026-01-21T00:00:00.000Z", etf);
    expect(normalized).toMatchObject({ symbol: "IBIT", resolutionStatus: "RESOLVED" });
  });
});
