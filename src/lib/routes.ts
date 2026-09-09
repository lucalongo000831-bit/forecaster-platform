import type { InstrumentRef } from "@/types";
import { canonicalCryptoSymbol } from "./instrument-identity";

export function instrumentPath(ref: InstrumentRef, section = "overview") {
  const cryptoSymbol = canonicalCryptoSymbol(ref.symbol, { market: ref.market });
  const market = cryptoSymbol ? "crypto" : ref.market.toLowerCase();
  const symbol = cryptoSymbol ?? ref.symbol;
  return `/instrument/${market}/${symbol.toLowerCase()}/${section}`;
}
