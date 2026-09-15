import type { SearchInstrument } from "@/types";
import { canonicalizeSearchInstrument } from "./instrument-identity";

function valid(value: unknown): value is SearchInstrument {
  if (!value || typeof value !== "object") return false;
  const row = value as SearchInstrument;
  return typeof row.symbol === "string" && !!row.symbol.trim() && typeof row.name === "string"
    && ["Stock", "ETF", "Index", "Forex", "Crypto"].includes(row.type)
    && typeof row.venue === "string" && typeof row.href === "string" && row.href.startsWith("/instrument/")
    && typeof row.price === "number" && Number.isFinite(row.price);
}

export function mergeSearchResults(local: SearchInstrument[], remote: unknown) {
  const rows = new Map<string, SearchInstrument>();
  for (const value of [...local, ...(Array.isArray(remote) ? remote : [])]) {
    if (!valid(value)) continue;
    const row = canonicalizeSearchInstrument(value);
    const key = row.symbol.trim().toLocaleUpperCase("en");
    const previous = rows.get(key);
    // A remote quote can refresh values, but cannot replace verified identity/routing.
    rows.set(key, previous ? { ...row, ...previous, price: row.price, venue: row.venue } : { ...row, symbol: key });
  }
  return [...rows.values()];
}
