import type { IssuerListing, ProviderSymbolMapping } from "@/types";

interface VerifiedIssuerRecord {
  legalNames: string[];
  legalName: string;
  countryCode: string;
  cik: string;
  lei: string | null;
  isin: string;
  reportingCurrency: string;
  comparableHistoryStartDate: string;
  listings: IssuerListing[];
  issuerProviderSymbols: Partial<Record<ProviderSymbolMapping["provider"], string>>;
}

// This registry contains identifiers verified against primary issuer and
// regulator sources. It is deliberately small: unknown identifiers remain
// missing and are never inferred from ticker resemblance alone.
const records: VerifiedIssuerRecord[] = [
  {
    legalNames: ["Stellantis N.V.", "Stellantis NV"],
    legalName: "Stellantis N.V.",
    countryCode: "NL",
    cik: "0001605484",
    lei: null,
    isin: "NL00150001Q9",
    reportingCurrency: "EUR",
    comparableHistoryStartDate: "2021-01-01",
    listings: [
      { symbol: "STLA", providerSymbol: "STLA", exchange: "NYSE", mic: "XNYS", currency: "USD", countryCode: "US", primary: false, verificationUrl: "https://www.stellantis.com/en/investors/stock-and-shareholder-info/stock-info" },
      { symbol: "STLAM", providerSymbol: "STLAM.MI", exchange: "Euronext Milan", mic: "XMIL", currency: "EUR", countryCode: "IT", primary: true, verificationUrl: "https://www.stellantis.com/en/investors/stock-and-shareholder-info/stock-info" },
      { symbol: "STLAP", providerSymbol: "STLAP.PA", exchange: "Euronext Paris", mic: "XPAR", currency: "EUR", countryCode: "FR", primary: false, verificationUrl: "https://www.stellantis.com/en/investors/stock-and-shareholder-info/stock-info" },
    ],
    issuerProviderSymbols: { "sec-edgar": "0001605484", finnhub: "STLA" },
  },
];

function normalizedName(value: string) {
  return value.toUpperCase().replace(/\b(N\.?V\.?|NV|INCORPORATED|INC|PLC|SA|S\.A\.)\b/g, "").replace(/[^A-Z0-9]+/g, " ").trim();
}

export function verifiedIssuerByLegalName(name: string | null | undefined) {
  if (!name) return null;
  const normalized = normalizedName(name);
  return records.find((record) => record.legalNames.some((candidate) => normalizedName(candidate) === normalized)) ?? null;
}

export function verifiedIssuerByListing(symbolInput: string) {
  const symbol = symbolInput.toUpperCase();
  return records.find((record) => record.listings.some((listing) => listing.symbol === symbol || listing.providerSymbol === symbol)) ?? null;
}
