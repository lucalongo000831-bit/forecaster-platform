import { describe, expect, it } from "vitest";
import { politicalTransaction } from "@/engines/political/test-fixtures";
import { verifyPoliticalDisclosure } from "./political-verification";

describe("political disclosure verification", () => {
  const official = { filingId: "filing-tx-1", politicianName: "Ada Example", transactionDate: "2025-01-01", disclosureDate: "2025-01-20", assetName: "Apple Inc.", symbol: "AAPL", transactionType: "PURCHASE", amountRangeRaw: "$1,001 - $15,000", sourceUrl: "https://official.example.test" };
  it("marks exact matches as official-source verified", () => expect(verifyPoliticalDisclosure(politicalTransaction(), official).status).toBe("OFFICIAL_SOURCE_VERIFIED"));
  it("records explicit source conflicts without silently overwriting", () => { const result = verifyPoliticalDisclosure(politicalTransaction(), { ...official, symbol: "MSFT" }); expect(result.status).toBe("SOURCE_MISMATCH"); expect(result.conflicts).toEqual([expect.objectContaining({ field: "symbol", providerValue: "AAPL", officialValue: "MSFT", code: "POLITICAL_DATA_CONFLICT" })]); });
  it("keeps provider-only records pending when a source URL exists", () => expect(verifyPoliticalDisclosure(politicalTransaction(), null).status).toBe("PENDING"));
  it("labels records without an official reference unverifiable", () => expect(verifyPoliticalDisclosure(politicalTransaction({ sourceUrl: null }), null).status).toBe("UNVERIFIABLE"));
});
