import type { PoliticalTransaction, PoliticalVerificationStatus } from "@/types";

export interface OfficialDisclosureRecord {
  filingId: string | null;
  politicianName: string;
  transactionDate: string;
  disclosureDate: string;
  assetName: string;
  symbol: string | null;
  transactionType: string;
  amountRangeRaw: string | null;
  sourceUrl: string;
}

export interface PoliticalVerificationResult {
  status: PoliticalVerificationStatus;
  conflicts: Array<{ field: string; providerValue: string | null; officialValue: string | null; code: "POLITICAL_DATA_CONFLICT" }>;
  verifiedAt: string;
}

export function verifyPoliticalDisclosure(provider: PoliticalTransaction, official: OfficialDisclosureRecord | null): PoliticalVerificationResult {
  if (!official) return { status: provider.sourceUrl ? "PENDING" : "UNVERIFIABLE", conflicts: [], verifiedAt: new Date().toISOString() };
  const checks: Array<[string, string | null, string | null]> = [
    ["politicianName", provider.politicianName, official.politicianName], ["transactionDate", provider.transactionDate, official.transactionDate],
    ["disclosureDate", provider.disclosureDate, official.disclosureDate], ["symbol", provider.symbol, official.symbol], ["transactionType", provider.transactionType, official.transactionType], ["amountRangeRaw", provider.amountRangeRaw, official.amountRangeRaw],
  ];
  const conflicts = checks.filter(([, left, right]) => (left ?? "").trim().toLowerCase() !== (right ?? "").trim().toLowerCase()).map(([field, providerValue, officialValue]) => ({ field, providerValue, officialValue, code: "POLITICAL_DATA_CONFLICT" as const }));
  return { status: conflicts.length ? "SOURCE_MISMATCH" : "OFFICIAL_SOURCE_VERIFIED", conflicts, verifiedAt: new Date().toISOString() };
}
