import { describe, expect, it } from "vitest";
import { mapDisclosure } from "./fmp-adapter";

describe("FMP political disclosure mapping", () => {
  it("normalizes House purchases with disclosure provenance", () => {
    const disclosure = mapDisclosure({ firstName: "Ada", lastName: "Example", symbol: "AAPL", assetDescription: "Apple Inc.", transactionDate: "2025-04-01", disclosureDate: "2025-04-21", transactionType: "Purchase", amount: "$1,001 - $15,000" }, "HOUSE");
    expect(disclosure).toMatchObject({ chamber: "HOUSE", politician: "Ada Example", symbol: "AAPL", transactionType: "PURCHASE", transactionDate: "2025-04-01", disclosureDate: "2025-04-21" });
  });

  it("never invents a disclosure without a transaction date", () => {
    expect(mapDisclosure({ symbol: "NVDA" }, "SENATE")).toBeNull();
  });
});
