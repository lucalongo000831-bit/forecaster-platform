import { describe, expect, it } from "vitest";
import { classifyCompanyInstrument } from "./instrument-applicability";

describe("classifyCompanyInstrument", () => {
  it.each([
    ["SPY", "ETF", "EQUITY", "ETF"],
    ["^GSPC", "EQUITY", "EQUITY", "INDEX"],
    ["BTC-USD", "EQUITY", "EQUITY", "CRYPTOCURRENCY"],
    ["EURUSD=X", "EQUITY", "EQUITY", "CURRENCY"],
    ["GC=F", "EQUITY", "EQUITY", "FUTURE"],
  ])("rejects non-company instrument %s", (symbol, profileType, quoteType, expectedType) => {
    expect(classifyCompanyInstrument(symbol, profileType, quoteType)).toEqual({
      instrumentType: expectedType,
      applicable: false,
    });
  });

  it("accepts an equity when the providers agree", () => {
    expect(classifyCompanyInstrument("AAPL", "EQUITY", "EQUITY")).toEqual({
      instrumentType: "EQUITY",
      applicable: true,
    });
  });

  it("rejects a fund when the provider omits its ETF flag but the verified name identifies it", () => {
    expect(classifyCompanyInstrument("SPY", "EQUITY", "EQUITY", "SPDR S&P 500 ETF Trust")).toEqual({
      instrumentType: "ETF",
      applicable: false,
    });
  });

  it("fails closed for an unknown instrument type", () => {
    expect(classifyCompanyInstrument("UNKNOWN", null, null)).toEqual({
      instrumentType: "UNKNOWN",
      applicable: false,
    });
  });
});
