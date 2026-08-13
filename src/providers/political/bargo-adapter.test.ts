import { describe, expect, it } from "vitest";
import { mapBargoTrade } from "./bargo-adapter";

describe("Bargo Congress adapter", () => {
  it("normalizes the live schema without treating Bargo as official", () => { const row = mapBargoTrade({ member: "Hon. Jane Doe", member_slug: "jane-doe", chamber: "house", state: "CA", ticker: "NVDA", asset: "NVIDIA Corporation", type: "purchase", amount_low: 1001, amount_high: 15000, amount_range: "$1,001 - $15,000", transaction_date: "2026-05-12", disclosure_date: "2026-06-02", filing_portal: "https://disclosures-clerk.house.gov/FinancialDisclosure" }); expect(row).toMatchObject({ chamber: "HOUSE", symbol: "NVDA", transactionType: "PURCHASE", provider: "bargo", amountRange: "$1,001 - $15,000" }); });
});
