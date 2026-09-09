import { describe, expect, it } from "vitest";
import {
  canonicalCryptoSymbol,
  canonicalizeLegacyCryptoPathname,
  canonicalizeSearchInstrument,
  isCanonicalCryptoSymbol,
} from "./instrument-identity";
import { instrumentPath } from "./routes";

describe("canonical crypto identity", () => {
  it.each(["ETH", "ETHUSD", "ETH-USD", "ETH-USD.CC", "eth-usd", "eth-usd.cc"])("maps %s to ETH-USD", (input) => {
    expect(canonicalCryptoSymbol(input)).toBe("ETH-USD");
  });

  it.each(["BTC", "BTCUSD", "BTC-USD", "BTC-USD.CC", "btc-usd", "btc-usd.cc"])("maps %s to BTC-USD", (input) => {
    expect(canonicalCryptoSymbol(input)).toBe("BTC-USD");
  });

  it("normalizes other supported crypto without hard-coding only ETH and BTC", () => {
    expect(canonicalCryptoSymbol("SOL-USD.CC")).toBe("SOL-USD");
    expect(canonicalCryptoSymbol("ADAUSD", { market: "CC" })).toBe("ADA-USD");
    expect(isCanonicalCryptoSymbol("DOGE-USD")).toBe(true);
  });

  it.each(["NVDA", "AAPL", "MSFT", "STLAM.MI", "SPY", "QQQ", "ABC.CC", "ETH-USD.CC.CC", "../ETH-USD.CC"])("does not misclassify %s", (input) => {
    expect(canonicalCryptoSymbol(input, { market: "US", quoteType: "EQUITY" })).toBeNull();
  });

  it("keeps the real ETH ETF distinct when the route context is non-crypto", () => {
    expect(canonicalCryptoSymbol("ETH", { market: "US", quoteType: "ETF" })).toBeNull();
    expect(instrumentPath({ market: "US", symbol: "ETH" })).toBe("/instrument/us/eth/overview");
  });
});

describe("crypto search and route canonicalization", () => {
  it("canonicalizes the EODHD .CC search representation", () => {
    expect(canonicalizeSearchInstrument({
      symbol: "ETH-USD.CC",
      name: "Ethereum",
      type: "Stock",
      venue: "CC",
      price: 0,
      currency: "USD",
      href: "/instrument/cc/eth-usd.cc/overview",
      source: "eodhd",
    })).toMatchObject({
      symbol: "ETH-USD",
      type: "Crypto",
      venue: "CRYPTO",
      href: "/instrument/crypto/eth-usd/overview",
    });
  });

  it.each([
    ["/instrument/cc/eth-usd.cc/overview", "/instrument/crypto/eth-usd/overview"],
    ["/instrument/cc/btc-usd.cc/technical", "/instrument/crypto/btc-usd/technical"],
    ["/instrument/CC/ETH-USD.CC/pattern", "/instrument/crypto/eth-usd/pattern"],
    ["/instrument/crypto/ethusd/seasonality", "/instrument/crypto/eth-usd/seasonality"],
  ])("redirects %s and preserves the section", (input, expected) => {
    expect(canonicalizeLegacyCryptoPathname(input)).toBe(expected);
  });

  it.each([
    "/instrument/crypto/eth-usd/overview",
    "/instrument/us/nvda/overview",
    "/instrument/milan/stlam.mi/overview",
    "/instrument/cc/stlam.cc/overview",
  ])("does not redirect canonical or non-crypto path %s", (path) => {
    expect(canonicalizeLegacyCryptoPathname(path)).toBeNull();
  });
});
