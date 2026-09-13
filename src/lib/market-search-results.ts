import type { SearchInstrument } from "@/types";

function instrumentKey(instrument: SearchInstrument) {
  return instrument.symbol.trim().toLocaleUpperCase("en");
}

export function mergeSearchResults(local: SearchInstrument[], remote: SearchInstrument[]) {
  const remoteBySymbol = new Map(remote.map((instrument) => [instrumentKey(instrument), instrument]));
  const localSymbols = new Set(local.map(instrumentKey));

  return [
    ...local.map((instrument) => ({ ...instrument, ...remoteBySymbol.get(instrumentKey(instrument)) })),
    ...remote.filter((instrument) => !localSymbols.has(instrumentKey(instrument))),
  ];
}
