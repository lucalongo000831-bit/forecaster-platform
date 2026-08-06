import { describe, expect, it } from "vitest";
import { instrumentHref, normalizeSearchQuery, normalizeSymbol } from "./symbol-resolver";

describe("symbol resolver", () => {
  it.each(["AAPL", "BRK-B", "ENI.MI", "BTC-USD", "^GSPC", "EURUSD=X"])("accepts %s", (symbol) => {
    expect(normalizeSymbol(symbol.toLowerCase())).toBe(symbol);
  });

  it.each(["", "../AAPL", "AAPL?x=1", "A".repeat(40), "<script>"])("rejects %s", (symbol) => {
    expect(() => normalizeSymbol(symbol)).toThrow();
  });

  it("normalizes search whitespace and safely encodes navigation", () => {
    expect(normalizeSearchQuery("  Banca   Monte dei Paschi ")).toBe("Banca Monte dei Paschi");
    expect(instrumentHref("^GSPC", "INDEX", "INDEX")).toBe("/instrument/index/%5Egspc/overview");
  });
});
