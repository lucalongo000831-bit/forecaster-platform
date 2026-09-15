import { describe, expect, it } from "vitest";
import type { SearchInstrument } from "@/types";
import { mergeSearchResults, rankSearchResults } from "./market-search-results";

const stlam: SearchInstrument = { symbol: "STLAM.MI", name: "Stellantis N.V.", type: "Stock", venue: "Milan", price: 9.2, currency: "EUR", href: "/instrument/milan/stlam.mi/overview", source: "yahoo" };
const bitcoin: SearchInstrument = { symbol: "BTC-USD", name: "Bitcoin USD", type: "Crypto", venue: "CCC", price: 77_000, currency: "USD", href: "/instrument/crypto/btc-usd/overview", source: "yahoo" };

describe("market search result merge", () => {
  it("preserves verified local matches when a remote provider returns no rows", () => {
    expect(mergeSearchResults([stlam], [])).toEqual([stlam]);
  });

  it("keeps canonical matches first, refreshes their data and removes duplicates", () => {
    const refreshed = { ...bitcoin, price: 78_500, venue: "CRYPTO" };
    const unrelated: SearchInstrument = { symbol: "BTC", name: "Bitcoin ETF", type: "ETF", venue: "US", price: 25, currency: "USD", href: "/instrument/us/btc/overview", source: "yahoo" };
    const result = mergeSearchResults([bitcoin], [unrelated, refreshed]);

    expect(result.map((item) => item.symbol)).toEqual(["BTC-USD", "BTC"]);
    expect(result[0]).toMatchObject({ price: 78_500, venue: "CRYPTO" });
  });

  it("normalizes crypto aliases and rejects malformed provider rows", () => {
    const malformed = { symbol: "BROKEN", name: null, type: "CC" };
    const btcAlias = { ...bitcoin, symbol: "BTC", venue: "CC", href: "/instrument/cc/btc/overview" };
    const ethAlias = { ...bitcoin, symbol: "ETH.CC", name: "Ether", venue: "CC", href: "/instrument/cc/eth.cc/overview" };
    const result = mergeSearchResults([], [malformed, btcAlias, ethAlias, btcAlias]);

    expect(result.map((item) => [item.symbol, item.type, item.href])).toEqual([
      ["BTC-USD", "Crypto", "/instrument/crypto/btc-usd/overview"],
      ["ETH-USD", "Crypto", "/instrument/crypto/eth-usd/overview"],
    ]);
  });

  it("keeps equity, ETF, and European equity identities routable", () => {
    const rows: SearchInstrument[] = [
      { symbol: "NVDA", name: "NVIDIA", type: "Stock", venue: "NASDAQ", price: 1, currency: "USD", href: "/instrument/nasdaq/nvda/overview" },
      { symbol: "SPY", name: "SPDR S&P 500", type: "ETF", venue: "NYSE", price: 1, currency: "USD", href: "/instrument/nyse/spy/overview" },
      stlam,
    ];
    expect(mergeSearchResults([], rows).map((item) => [item.symbol, item.type, item.href])).toEqual([
      ["NVDA", "Stock", "/instrument/nasdaq/nvda/overview"],
      ["SPY", "ETF", "/instrument/nyse/spy/overview"],
      ["STLAM.MI", "Stock", "/instrument/milan/stlam.mi/overview"],
    ]);
  });
});

describe("market search result ranking", () => {
  it("puts a canonical crypto pair ahead of unrelated name substrings", () => {
    const ethero: SearchInstrument = { symbol: "ALENT.PA", name: "Ethero", type: "Stock", venue: "PAR", price: 1, currency: "EUR", href: "/instrument/par/alent.pa/overview" };
    const ethereum: SearchInstrument = { symbol: "ETH-USD", name: "Ethereum", type: "Crypto", venue: "CRYPTO", price: 1, currency: "USD", href: "/instrument/crypto/eth-usd/overview" };

    expect(rankSearchResults([ethero, ethereum], "ETH").map((row) => row.symbol)).toEqual(["ETH-USD", "ALENT.PA"]);
  });
});
