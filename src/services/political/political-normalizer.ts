import type { PoliticalDisclosure } from "@/providers";
import type { PoliticalTransaction, ResolvedInstrument } from "@/types";
import { disclosureDelayDays, normalizeChamber, normalizeOwnerType, normalizeParty, normalizePoliticianName, normalizePoliticalTransactionType, parsePoliticalAmountRange, politicalTransactionFingerprint, stablePoliticalId } from "@/engines/political";

const directCryptoAliases: ReadonlyArray<{ symbol: string; pattern: RegExp }> = [
  { symbol: "BTC-USD", pattern: /\b(bitcoin|btc)\b/i },
  { symbol: "ETH-USD", pattern: /\b(ethereum|ether|eth)\b/i },
];

export function resolveDirectCryptoAlias(asset: string, assetType: string | null, rawTicker: string | null) {
  if (rawTicker) return null;
  const description = `${asset} ${assetType ?? ""}`;
  if (/\b(etf|fund|trust|note|etn|shares?)\b/i.test(description)) return null;
  return directCryptoAliases.find((alias) => alias.pattern.test(description))?.symbol ?? null;
}

export function normalizePoliticalDisclosure(disclosure: PoliticalDisclosure, fetchedAt: string, instrument: ResolvedInstrument | null = null): PoliticalTransaction | null {
  if (!disclosure.disclosureDate) return null;
  const politician = normalizePoliticianName(disclosure.politician); const amount = parsePoliticalAmountRange(disclosure.amountRange);
  const rawTicker = disclosure.symbol?.trim().toUpperCase() || null;
  const cryptoAlias = resolveDirectCryptoAlias(disclosure.asset, disclosure.assetType, rawTicker);
  const optionLike = disclosure.transactionType === "OPTION" || /\b(call|put|option)\b/i.test(disclosure.asset);
  const nonMarket = /private|real estate|municipal|bond|treasury|partnership/i.test(disclosure.asset) && !rawTicker;
  const resolved = Boolean(instrument && rawTicker) || Boolean(cryptoAlias);
  const now = new Date().toISOString();
  const transaction: PoliticalTransaction = {
    id: `ptx-${stablePoliticalId(disclosure.sourceId, politician.politicianId, disclosure.transactionDate, disclosure.disclosureDate)}`,
    sourceId: disclosure.sourceId, politicianId: politician.politicianId, politicianName: politician.displayName,
    chamber: normalizeChamber(disclosure.chamber), party: normalizeParty(disclosure.party), state: disclosure.state, district: disclosure.district,
    ownerType: normalizeOwnerType(disclosure.ownership), assetName: disclosure.asset, assetType: disclosure.assetType, sector: instrument?.issuer?.sector ?? null,
    rawTicker, canonicalInstrumentId: null, canonicalIssuerId: null, symbol: cryptoAlias ?? (instrument && rawTicker ? instrument.canonicalSymbol : rawTicker),
    transactionType: normalizePoliticalTransactionType(disclosure.rawTransactionType ?? disclosure.transactionType), transactionDate: disclosure.transactionDate,
    disclosureDate: disclosure.disclosureDate, marketAvailableDate: disclosure.disclosureDate, disclosureDelayDays: disclosureDelayDays(disclosure.transactionDate, disclosure.disclosureDate),
    amountMin: amount.min, amountMax: amount.max, amountRangeRaw: disclosure.amountRange, estimatedAmount: amount.estimated, amountMethod: amount.method,
    priceAtTransaction: null, priceAtDisclosure: null, currentPrice: null, sharesEstimate: null,
    source: "Financial Modeling Prep congressional disclosure data", sourceUrl: disclosure.sourceUrl, filingId: disclosure.filingId, filingType: disclosure.filingType,
    provider: "fmp", fetchedAt, verified: false, verificationStatus: disclosure.sourceUrl ? "PENDING" : "PROVIDER_ONLY",
    resolutionStatus: resolved ? "RESOLVED" : nonMarket || optionLike ? "NON_MARKET_ASSET" : "UNRESOLVED_ASSET",
    fingerprint: "", amendment: disclosure.amendment, createdAt: now, updatedAt: now,
  };
  transaction.fingerprint = politicalTransactionFingerprint(transaction);
  return transaction;
}
