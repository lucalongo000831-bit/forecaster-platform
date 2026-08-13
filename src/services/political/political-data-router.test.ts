import { beforeEach, describe, expect, it, vi } from "vitest";
import { politicalTransaction } from "@/engines/political/test-fixtures";
import type { PoliticalAssetContext } from "@/types";

const mocks = vi.hoisted(() => ({
  loadPoliticalTransactionsForAsset: vi.fn(),
  loadPersistedPoliticalTransactions: vi.fn(),
  houseTrades: vi.fn(),
  senateTrades: vi.fn(),
  profile: vi.fn(),
}));

vi.mock("./political-repository", () => ({
  loadPoliticalTransactionsForAsset: mocks.loadPoliticalTransactionsForAsset,
  loadPersistedPoliticalTransactions: mocks.loadPersistedPoliticalTransactions,
}));
vi.mock("@/providers", () => ({
  financialProviderRouter: { houseTrades: mocks.houseTrades, senateTrades: mocks.senateTrades, profile: mocks.profile },
}));

import { PoliticalDataRouter } from "./political-data-router";

const context: PoliticalAssetContext = { requestedSymbol: "AAPL", canonicalSymbol: "AAPL", assetClass: "EQUITY", instrumentId: "instrument-aapl", issuerId: "issuer-apple", aliases: ["AAPL"], providerMappings: [], resolutionQuality: "verified", cacheIdentity: "issuer:issuer-apple", matchStrategy: "CANONICAL_ISSUER" };
const meta = { provider: "fmp", fetchedAt: "2026-08-14T00:00:00.000Z" };

describe("PoliticalDataRouter DB-first behavior", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.houseTrades.mockResolvedValue({ data: [], meta });
    mocks.senateTrades.mockResolvedValue({ data: [], meta });
  });

  it("returns database records without contacting the provider", async () => {
    const transaction = politicalTransaction({ canonicalIssuerId: "issuer-apple" });
    mocks.loadPoliticalTransactionsForAsset.mockResolvedValue({ transactions: [transaction], politicians: [], fetchedAt: transaction.fetchedAt, databaseStatus: "AVAILABLE", matchStrategy: "CANONICAL_ISSUER", matchedAliases: ["AAPL"] });
    const result = await new PoliticalDataRouter().getTradesByAssetContext(context);
    expect(result.transactions).toEqual([transaction]);
    expect(result.provenance.sourceMode).toBe("DATABASE");
    expect(mocks.houseTrades).not.toHaveBeenCalled();
    expect(mocks.senateTrades).not.toHaveBeenCalled();
  });

  it("treats an available empty database as authoritative but not as a provider zero", async () => {
    mocks.loadPoliticalTransactionsForAsset.mockResolvedValue({ transactions: [], politicians: [], fetchedAt: meta.fetchedAt, databaseStatus: "AVAILABLE", matchStrategy: "CANONICAL_ISSUER", matchedAliases: ["AAPL"] });
    const result = await new PoliticalDataRouter().getTradesByAssetContext(context);
    expect(result.transactions).toEqual([]);
    expect(result.provenance.databaseUsed).toBe(true);
    expect(result.provenance.providerAttempts).toEqual([]);
    expect(mocks.houseTrades).not.toHaveBeenCalled();
  });

  it("records successful empty provider responses only as partial fallback evidence", async () => {
    mocks.loadPoliticalTransactionsForAsset.mockResolvedValue({ transactions: [], politicians: [], fetchedAt: meta.fetchedAt, databaseStatus: "UNAVAILABLE", matchStrategy: "CANONICAL_ISSUER", matchedAliases: ["AAPL"] });
    const result = await new PoliticalDataRouter().getTradesByAssetContext(context);
    expect(result.transactions).toEqual([]);
    expect(result.provenance.sourceMode).toBe("PROVIDER_FALLBACK");
    expect(result.provenance.providerAttempts).toEqual([
      { provider: "fmp", status: "REQUEST_SUCCESS_EMPTY", records: 0 },
      { provider: "fmp", status: "REQUEST_SUCCESS_EMPTY", records: 0 },
    ]);
  });

  it("surfaces provider rate limiting instead of converting it to zero activity", async () => {
    mocks.loadPoliticalTransactionsForAsset.mockResolvedValue({ transactions: [], politicians: [], fetchedAt: meta.fetchedAt, databaseStatus: "UNAVAILABLE", matchStrategy: "CANONICAL_ISSUER", matchedAliases: ["AAPL"] });
    mocks.houseTrades.mockRejectedValue(new Error("429 rate limit"));
    mocks.senateTrades.mockRejectedValue(new Error("429 rate limit"));
    const result = await new PoliticalDataRouter().getTradesByAssetContext(context);
    expect(result.provenance.providerAttempts.every((attempt) => attempt.status === "RATE_LIMITED")).toBe(true);
  });
});
