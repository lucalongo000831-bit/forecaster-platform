import type { SearchInstrument } from "@/types";

const CRYPTO_MARKETS = new Set(["CC", "CCC", "CRYPTO", "CRYPTOCURRENCY"]);
const CRYPTO_QUOTE_CURRENCIES = new Set(["USD", "EUR", "GBP", "JPY", "AUD", "CAD", "BTC", "ETH", "USDT", "USDC"]);
const KNOWN_CRYPTO_BASES = new Set(["BTC", "ETH", "SOL", "XRP", "ADA", "DOGE", "AVAX", "DOT", "LINK", "MATIC", "USDT", "USDC"]);
const BARE_CRYPTO_ALIASES = new Set(["BTC", "ETH"]);

export interface InstrumentIdentityContext {
  market?: string | null;
  exchange?: string | null;
  assetClass?: string | null;
  quoteType?: string | null;
  type?: string | null;
}

function decodedUppercase(value: string) {
  try { return decodeURIComponent(value).trim().toUpperCase(); }
  catch { return value.trim().toUpperCase(); }
}

function contextValues(context: InstrumentIdentityContext) {
  return [context.market, context.exchange, context.assetClass, context.quoteType, context.type]
    .flatMap((value) => value ? [value.toUpperCase()] : []);
}

function hasCryptoContext(context: InstrumentIdentityContext) {
  return contextValues(context).some((value) => CRYPTO_MARKETS.has(value) || value.includes("CRYPTO"));
}

function hasContext(context: InstrumentIdentityContext) {
  return contextValues(context).length > 0;
}

function canonicalPair(base: string, quote: string) {
  return CRYPTO_QUOTE_CURRENCIES.has(quote) ? `${base}-${quote}` : null;
}

export function canonicalCryptoSymbol(symbolInput: string, context: InstrumentIdentityContext = {}): string | null {
  const symbol = decodedUppercase(symbolInput);
  const providerPair = symbol.match(/^([A-Z0-9]{2,20})-([A-Z]{3,5})\.CC$/);
  if (providerPair) return canonicalPair(providerPair[1]!, providerPair[2]!);

  const pair = symbol.match(/^([A-Z0-9]{2,20})-([A-Z]{3,5})$/);
  if (pair) return canonicalPair(pair[1]!, pair[2]!);

  const compact = symbol.match(/^([A-Z0-9]{2,20})(USD|EUR|GBP|JPY|AUD|CAD|BTC|ETH|USDT|USDC)$/);
  if (compact && (hasCryptoContext(context) || KNOWN_CRYPTO_BASES.has(compact[1]!))) {
    return canonicalPair(compact[1]!, compact[2]!);
  }

  if (BARE_CRYPTO_ALIASES.has(symbol) && (!hasContext(context) || hasCryptoContext(context))) return `${symbol}-USD`;
  if (KNOWN_CRYPTO_BASES.has(symbol) && hasCryptoContext(context)) return `${symbol}-USD`;
  return null;
}

export function isCanonicalCryptoSymbol(symbolInput: string) {
  const symbol = decodedUppercase(symbolInput);
  return canonicalCryptoSymbol(symbol) === symbol;
}

export function cryptoBaseSymbol(symbolInput: string) {
  const canonical = canonicalCryptoSymbol(symbolInput);
  return canonical?.split("-")[0] ?? null;
}

export function canonicalizeSearchInstrument(instrument: SearchInstrument): SearchInstrument {
  const symbol = canonicalCryptoSymbol(instrument.symbol, {
    market: instrument.venue,
    exchange: instrument.venue,
    quoteType: instrument.type,
    type: instrument.type,
  });
  if (!symbol) return instrument;
  return {
    ...instrument,
    symbol,
    type: "Crypto",
    venue: "CRYPTO",
    href: `/instrument/crypto/${encodeURIComponent(symbol.toLowerCase())}/overview`,
  };
}

export function canonicalizeLegacyCryptoPathname(pathname: string): string | null {
  const segments = pathname.split("/");
  if (segments[1]?.toLowerCase() !== "instrument" || !segments[2] || !segments[3]) return null;
  const market = decodedUppercase(segments[2]);
  if (!CRYPTO_MARKETS.has(market)) return null;
  const symbol = canonicalCryptoSymbol(segments[3], { market });
  if (!symbol) return null;
  const canonicalSegments = ["", "instrument", "crypto", encodeURIComponent(symbol.toLowerCase()), ...segments.slice(4)];
  const canonical = canonicalSegments.join("/");
  return canonical === pathname ? null : canonical;
}
