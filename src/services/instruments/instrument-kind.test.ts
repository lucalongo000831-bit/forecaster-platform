import { describe, expect, it } from "vitest";
import { verifiedInstrumentKind } from "./instrument-kind";

describe("verified direct instrument classification", () => {
  it.each([["SPY", "ETF"], ["QQQ", "ETF"], ["GIGB", "ETF"], ["IBIT", "ETF"], ["BTC-USD", "CRYPTO"], ["ETH-USD", "CRYPTO"], ["^GSPC", "INDEX"]] as const)("classifies %s as %s", (symbol, expected) => expect(verifiedInstrumentKind(symbol, "EQUITY")).toBe(expected));
  it("does not classify an ordinary equity as an ETF", () => expect(verifiedInstrumentKind("AAPL", "EQUITY", "Apple Inc.")).toBeNull());
});
