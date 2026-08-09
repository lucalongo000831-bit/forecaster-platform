import { describe, expect, it } from "vitest";
import { providerSymbol } from "./instrument-resolver";

describe("providerSymbol", () => {
  it("keeps listing-specific provider mappings distinct", () => {
    const instrument = { mappings: [{ provider: "eodhd" as const, symbol: "STLAM.MI", exchangeCode: "MI", providerInstrumentId: null, confidence: 1, verifiedAt: "2026-01-01" }] };
    expect(providerSymbol(instrument as never, "eodhd")).toBe("STLAM.MI");
    expect(providerSymbol(instrument as never, "sec-edgar")).toBeNull();
  });
});
