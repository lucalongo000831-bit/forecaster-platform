import { describe, expect, it } from "vitest";
import { deduplicatePoliticalTransactions, disclosureDelayDays, normalizeChamber, normalizeOwnerType, normalizeParty, normalizePoliticalTransactionType, normalizePoliticianName, parsePoliticalAmountRange, politicalTransactionFingerprint, stablePoliticalId } from "./normalization";
import { politicalTransaction } from "./test-fixtures";

describe("political disclosure normalization", () => {
  it("normalizes names deterministically without honorific noise", () => { const value = normalizePoliticianName("  Jane   Q. Doe, Jr. "); expect(value.normalizedName).toBe("jane doe"); expect(value.politicianId).toBe(normalizePoliticianName("Jane Doe").politicianId); });
  it("creates stable non-secret identifiers", () => { expect(stablePoliticalId("Ada", "HOUSE")).toBe(stablePoliticalId("ada", "house")); expect(stablePoliticalId("Ada")).not.toBe(stablePoliticalId("Grace")); });
  it.each([["House of Representatives", "HOUSE"], ["Senator", "SENATE"], ["", "UNKNOWN"]])("maps chamber %s", (input, expected) => expect(normalizeChamber(input)).toBe(expected));
  it.each([["D", "DEMOCRATIC"], ["Republican", "REPUBLICAN"], ["Independent", "INDEPENDENT"], [null, "UNKNOWN"]])("maps party %s", (input, expected) => expect(normalizeParty(input)).toBe(expected));
  it.each([["self", "SELF"], ["Spouse", "SPOUSE"], ["dependent child", "DEPENDENT"], ["joint", "JOINT"], ["family trust", "TRUST"], [null, "UNKNOWN"]])("maps owner %s", (input, expected) => expect(normalizeOwnerType(input)).toBe(expected));
  it.each([["Purchase", "PURCHASE"], ["Sale (Full)", "SALE_FULL"], ["Sale (Partial)", "SALE_PARTIAL"], ["Sale", "SALE"], ["Exchange", "EXCHANGE"], ["Option exercise", "OPTION"], [null, "UNKNOWN"]])("maps transaction %s", (input, expected) => expect(normalizePoliticalTransactionType(input)).toBe(expected));
  it("preserves statutory amount ranges", () => expect(parsePoliticalAmountRange("$1,001 - $15,000")).toEqual({ min: 1001, max: 15000, estimated: 8000.5, method: "MIDPOINT_ESTIMATE" }));
  it("supports exact numeric amounts", () => expect(parsePoliticalAmountRange(25000)).toEqual({ min: 25000, max: 25000, estimated: 25000, method: "EXACT" }));
  it("does not invent unknown amounts", () => expect(parsePoliticalAmountRange("not reported")).toEqual({ min: null, max: null, estimated: null, method: "UNKNOWN" }));
  it("computes non-negative disclosure delays", () => { expect(disclosureDelayDays("2025-01-01", "2025-01-20")).toBe(19); expect(disclosureDelayDays("2025-01-20", "2025-01-01")).toBe(0); });
  it("deduplicates logical transactions", () => { const row = politicalTransaction(); const duplicate = { ...row, id: "tx-copy" }; const result = deduplicatePoliticalTransactions([row, duplicate]); expect(result.data).toHaveLength(1); expect(result.duplicatesRemoved).toBe(1); expect(result.duplicateRate).toBe(50); });
  it("prefers amendments when fingerprints collide", () => { const row = politicalTransaction(); const amendment = { ...row, id: "tx-amended", amendment: true }; expect(deduplicatePoliticalTransactions([row, amendment]).data[0]?.id).toBe("tx-amended"); });
  it("deduplicates the same logical transaction across providers and filing identifiers", () => { const row = politicalTransaction(); const alternate = { ...row, provider: "bargo" as const, sourceId: "another-source", filingId: "another-filing", disclosureDate: "2025-02-04" }; expect(politicalTransactionFingerprint(row)).toBe(politicalTransactionFingerprint(alternate)); });
  it("marks cross-provider FMP and Bargo matches while preserving both source rows", () => { const row = politicalTransaction(); const alternate = { ...row, provider: "bargo" as const, sourceId: "bargo-1", disclosureDate: "2025-02-04" }; const result = deduplicatePoliticalTransactions([row, alternate]); expect(result.data).toHaveLength(1); expect(result.data[0]?.verificationStatus).toBe("BARGO_FMP_MATCH"); expect(result.sourceRows).toHaveLength(2); });
});
