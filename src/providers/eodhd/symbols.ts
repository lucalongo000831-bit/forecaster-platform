import { normalizeSymbol } from "@/services/yahoo/symbol-resolver";
import { isCanonicalCryptoSymbol } from "@/lib/instrument-identity";

const knownSuffixes = new Set(["MI", "LSE", "PA", "DE", "AS", "BR", "SW", "TO", "V", "AX", "HK", "T", "SG", "MC"]);

export function toEodhdSymbol(symbolInput: string) {
  const symbol = normalizeSymbol(symbolInput);
  if (symbol.startsWith("^") || symbol.includes("=") || isCanonicalCryptoSymbol(symbol)) return null;
  const suffix = symbol.split(".").at(-1);
  return suffix && knownSuffixes.has(suffix) ? symbol : `${symbol}.US`;
}

export function fromEodhdSymbol(code: string, exchangeCode?: string | null) {
  const normalized = code.toUpperCase();
  if (normalized.includes(".")) return normalized.endsWith(".US") ? normalized.slice(0, -3) : normalized;
  return exchangeCode?.toUpperCase() === "US" ? normalized : exchangeCode ? `${normalized}.${exchangeCode.toUpperCase()}` : normalized;
}
