import type { InstrumentRef } from "@/types";

export function instrumentPath(ref: InstrumentRef, section = "overview") {
  return `/instrument/${ref.market.toLowerCase()}/${ref.symbol.toLowerCase()}/${section}`;
}
