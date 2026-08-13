import "server-only";

import { providerCached } from "@/providers/cache";
import { coinGeckoAdapter } from "@/providers/coingecko/adapter";
import { resolveSecIdentity } from "@/providers/sec/edgar-adapter";
import { providerResult } from "@/providers/metadata";
import { financialProviderRouter } from "@/providers/router";
import type { ProviderName } from "@/providers/types";
import { normalizeSymbol } from "@/services/yahoo/symbol-resolver";
import type { InstrumentKind, ProviderSymbolMapping, ResolvedInstrument } from "@/types";
import { verifiedIssuerByLegalName, verifiedIssuerByListing } from "./verified-issuer-registry";
import { verifiedInstrumentKind } from "./instrument-kind";

function kindFor(symbol: string, quoteType?: string | null, name?: string | null): InstrumentKind {
  const verified = verifiedInstrumentKind(symbol, quoteType, name);
  if (verified) return verified;
  const type = quoteType?.toUpperCase() ?? "";
  if (type.includes("FUND")) return "FUND";
  return "EQUITY";
}

function map(provider: ProviderName, symbol: string, exchangeCode: string | null, providerInstrumentId: string | null, confidence: number): ProviderSymbolMapping {
  return { provider, symbol, exchangeCode, providerInstrumentId, confidence, verifiedAt: new Date().toISOString() };
}

export async function resolveInstrument(symbolInput: string): Promise<ResolvedInstrument> {
  const symbol = normalizeSymbol(decodeURIComponent(symbolInput));
  return (await providerCached(`instrument-resolution:v3:${symbol}`, { freshSeconds: 30 * 86_400, staleSeconds: 60 * 86_400 }, async () => {
    const warnings: string[] = []; const mappings: ProviderSymbolMapping[] = [map("yahoo", symbol, null, null, 1)];
    let name = symbol; let exchange: string | null = null; let currency: string | null = null; let countryCode: string | null = null; let sector: string | null = null; let industry: string | null = null; let website: string | null = null; let cik: string | null = null; let coinGeckoId: string | null = null; let quoteType: string | null = null;
    if (symbol.endsWith("-USD")) {
      coinGeckoId = await coinGeckoAdapter.resolveId(symbol).catch(() => null);
      if (coinGeckoId) mappings.push(map("coingecko", coinGeckoId, "CRYPTO", coinGeckoId, 1)); else warnings.push("CoinGecko identifier unresolved.");
      exchange = "CRYPTO"; currency = symbol.split("-").at(-1) ?? "USD"; quoteType = "CRYPTO";
    } else {
      const profile = await financialProviderRouter.profile(symbol).catch(() => null);
      if (profile) {
        name = profile.data.name; exchange = profile.data.exchange; currency = profile.data.currency; countryCode = profile.data.country; sector = profile.data.sector; industry = profile.data.industry; website = profile.data.website; quoteType = profile.data.quoteType;
        mappings.push(map(profile.meta.provider, profile.meta.provider === "eodhd" && !symbol.includes(".") ? `${symbol}.US` : symbol, exchange, null, 0.95));
      }
      const verified = verifiedIssuerByLegalName(profile?.data.name) ?? verifiedIssuerByListing(symbol);
      const sec = await resolveSecIdentity(symbol, profile?.data.name ?? verified?.legalName).catch(() => null);
      if (sec) { cik = sec.cik; name = profile?.data.name ?? sec.title; mappings.push(map("sec-edgar", sec.cik, "SEC", sec.cik, 1)); }
      if (!profile && !sec) warnings.push("Issuer identifiers could not be verified by EODHD or SEC.");
      if (!symbol.startsWith("^") && !symbol.includes("=")) {
        mappings.push(map("fmp", symbol, exchange, null, 0.8), map("finnhub", verified?.issuerProviderSymbols.finnhub ?? sec?.symbol ?? symbol.split(".")[0]!, exchange, null, verified || sec ? 1 : symbol.includes(".") ? 0.65 : 0.9), map("massive", symbol, exchange, null, symbol.includes(".") ? 0.4 : 0.9));
      }
      if (verified) {
        cik = verified.cik;
        countryCode = countryCode ?? verified.countryCode;
        mappings.push(...Object.entries(verified.issuerProviderSymbols).flatMap(([provider, providerSymbol]) => providerSymbol && !mappings.some((item) => item.provider === provider && item.symbol === providerSymbol) ? [map(provider as ProviderName, providerSymbol, provider === "sec-edgar" ? "SEC" : exchange, provider === "sec-edgar" ? providerSymbol : `issuer-alias:${providerSymbol}`, 1)] : []));
      }
    }
    const kind = kindFor(symbol, quoteType, name);
    const verified = verifiedIssuerByLegalName(name) ?? verifiedIssuerByListing(symbol);
    const issuer = kind === "EQUITY" ? { legalName: verified?.legalName ?? name, countryCode: verified?.countryCode ?? countryCode, lei: verified?.lei ?? null, cik: verified?.cik ?? cik, isin: verified?.isin ?? null, website, sector, industry, reportingCurrency: verified?.reportingCurrency ?? null, comparableHistoryStartDate: verified?.comparableHistoryStartDate ?? null } : null;
    const data: ResolvedInstrument = { canonicalSymbol: symbol, name, kind, exchange, mic: verified?.listings.find((listing) => listing.providerSymbol === symbol)?.mic ?? null, currency, tradingCurrency: currency, countryCode, issuer, listings: verified?.listings, mappings, resolutionQuality: warnings.length ? mappings.length > 1 ? "partial" : "unavailable" : "verified", warnings };
    return providerResult("eodhd", data, { freshness: "cached", freshnessType: "CACHED", quality: data.resolutionQuality });
  })).data;
}

export function providerSymbol(instrument: ResolvedInstrument, provider: ProviderName) {
  return instrument.mappings.find((mapping) => mapping.provider === provider)?.symbol ?? null;
}
