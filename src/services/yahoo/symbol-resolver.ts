import "server-only";

import { FinancialDataError } from "./errors";

const SYMBOL_PATTERN = /^(?:\^[A-Z0-9][A-Z0-9.-]{0,29}|[A-Z0-9][A-Z0-9.^=-]{0,30})$/;
const QUERY_PATTERN = /^[\p{L}\p{N}\s.'’&+^=:_-]+$/u;

export function normalizeSymbol(input: string): string {
  const symbol = input.trim().toUpperCase();
  if (!symbol || symbol.length > 32 || !SYMBOL_PATTERN.test(symbol)) {
    throw new FinancialDataError(
      "INVALID_SYMBOL",
      "Ticker non valido. Sono ammessi lettere, numeri, punti, trattini, ^ e =.",
      400,
    );
  }
  return symbol;
}

export function normalizeSearchQuery(input: string): string {
  const query = input.trim().replace(/\s+/g, " ");
  if (!query || query.length > 80 || !QUERY_PATTERN.test(query)) {
    throw new FinancialDataError("INVALID_QUERY", "Inserisci una ricerca valida (massimo 80 caratteri).", 400);
  }
  return query;
}

export function marketSlug(exchange: string | undefined, quoteType?: string): string {
  const venue = (exchange ?? "market").toUpperCase();
  const type = (quoteType ?? "").toUpperCase();
  if (type === "CRYPTOCURRENCY") return "crypto";
  if (type === "INDEX") return "index";
  if (type === "CURRENCY") return "forex";
  if (["NMS", "NGM", "NCM", "NASDAQ"].includes(venue)) return "nasdaq";
  if (["NYQ", "NYSE", "PCX", "ASE"].includes(venue)) return "nyse";
  if (["MIL", "MTA"].includes(venue)) return "milan";
  return venue.toLowerCase().replace(/[^a-z0-9-]/g, "-") || "market";
}

export function instrumentHref(symbol: string, exchange?: string, quoteType?: string): string {
  return `/instrument/${encodeURIComponent(marketSlug(exchange, quoteType))}/${encodeURIComponent(symbol.toLowerCase())}/overview`;
}
