import { describe, expect, it } from "vitest";
import { mapCapitolExposedTrade } from "./capitol-exposed-adapter";

describe("CapitolExposed historical adapter", () => {
  it("preserves historical delisted identity instead of remapping it", () => { const row = mapCapitolExposedTrade({ id: "tr-house-old-1", member_id: "m-1", member_name: "Jane Doe", ticker: "BERY", asset_description: "Berry Global Group", transaction_type: "sale", transaction_date: "2025-01-10T00:00:00.000Z", disclosure_date: "2025-02-01T00:00:00.000Z", amount_min: "1001", amount_max: "15000", owner: "self", source_url: "https://disclosures-clerk.house.gov/FinancialDisclosure" }, { id: "m-1", name: "Jane Doe", party: "R", state: "TX", district: "1", chamber: "HOUSE" }); expect(row).toMatchObject({ symbol: "BERY", provider: "capitol-exposed", chamber: "HOUSE", party: "R" }); });
});
