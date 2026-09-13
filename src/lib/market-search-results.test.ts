import { describe, expect, it } from "vitest";
import type { SearchInstrument } from "@/types";
import { mergeSearchResults } from "./market-search-results";

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
});
