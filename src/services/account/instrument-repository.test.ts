import { describe, expect, it } from "vitest";
import { fallbackInstrumentType } from "./instrument-repository";

describe("fallbackInstrumentType", () => {
  it.each([
    ["AAPL", "EQUITY"],
    ["ENI.MI", "EQUITY"],
    ["^GSPC", "INDEX"],
    ["EURUSD=X", "FOREX"],
    ["BTC-USD", "CRYPTO"],
  ] as const)("derives %s without client-supplied metadata", (symbol, expected) => {
    expect(fallbackInstrumentType(symbol)).toBe(expected);
  });
});
