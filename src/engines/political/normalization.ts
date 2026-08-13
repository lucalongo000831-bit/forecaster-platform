import type { PoliticalAmountMethod, PoliticalChamber, PoliticalOwnerType, PoliticalParty, PoliticalTransaction, PoliticalTransactionType } from "@/types";

export const POLITICAL_NORMALIZATION_VERSION = "political-normalization-v1";

export function stablePoliticalId(...parts: Array<string | null | undefined>) {
  let hash = 2166136261;
  for (const character of parts.map((part) => part ?? "").join("|").toLowerCase()) {
    hash ^= character.charCodeAt(0);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
}

export function normalizePoliticianName(value: string) {
  const displayName = value.replace(/\s+/g, " ").replace(/\s*,\s*/g, ", ").trim();
  const tokens = displayName
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9\s'-]/g, " ")
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean)
    .filter((token) => !["jr", "sr", "ii", "iii", "iv"].includes(token));
  const withoutInitials = tokens.filter((token, index) => token.length > 1 || index === 0 || index === tokens.length - 1);
  const normalizedName = (withoutInitials.length >= 2 ? withoutInitials : tokens).join(" ");
  return { displayName: displayName || "Name unavailable", normalizedName: normalizedName || "name unavailable", politicianId: `pol-${stablePoliticalId(normalizedName || displayName)}` };
}

export function normalizeChamber(value: string | null | undefined): PoliticalChamber {
  const normalized = value?.toUpperCase() ?? "";
  if (normalized.includes("HOUSE") || normalized.includes("REPRESENTATIVE")) return "HOUSE";
  if (normalized.includes("SENATE") || normalized.includes("SENATOR")) return "SENATE";
  return "UNKNOWN";
}

export function normalizeParty(value: string | null | undefined): PoliticalParty {
  const normalized = value?.trim().toUpperCase() ?? "";
  if (normalized === "D" || normalized.includes("DEMOCRAT")) return "DEMOCRATIC";
  if (normalized === "R" || normalized.includes("REPUBLICAN")) return "REPUBLICAN";
  if (normalized === "I" || normalized.includes("INDEPENDENT")) return "INDEPENDENT";
  if (normalized) return "OTHER";
  return "UNKNOWN";
}

export function normalizeOwnerType(value: string | null | undefined): PoliticalOwnerType {
  const normalized = value?.toLowerCase() ?? "";
  if (/spouse|wife|husband/.test(normalized)) return "SPOUSE";
  if (/dependent|child/.test(normalized)) return "DEPENDENT";
  if (/joint|jt/.test(normalized)) return "JOINT";
  if (/trust/.test(normalized)) return "TRUST";
  if (/self|member/.test(normalized)) return "SELF";
  if (normalized) return "OTHER";
  return "UNKNOWN";
}

export function normalizePoliticalTransactionType(value: string | null | undefined): PoliticalTransactionType {
  const normalized = value?.toLowerCase() ?? "";
  if (/purchase|buy|acquisition/.test(normalized)) return "PURCHASE";
  if (/sale.*full|full.*sale/.test(normalized)) return "SALE_FULL";
  if (/sale.*partial|partial.*sale/.test(normalized)) return "SALE_PARTIAL";
  if (/sale|sell|disposition/.test(normalized)) return "SALE";
  if (/exchange|swap/.test(normalized)) return "EXCHANGE";
  if (/option/.test(normalized)) return "OPTION";
  if (normalized) return "OTHER";
  return "UNKNOWN";
}

export interface ParsedAmountRange {
  min: number | null;
  max: number | null;
  estimated: number | null;
  method: PoliticalAmountMethod;
}

function amountNumber(value: string) {
  const multiplier = /b/i.test(value) ? 1_000_000_000 : /m/i.test(value) ? 1_000_000 : /k/i.test(value) ? 1_000 : 1;
  const parsed = Number(value.replace(/[$,\s]/g, "").replace(/[kmb]/i, ""));
  return Number.isFinite(parsed) ? parsed * multiplier : null;
}

export function parsePoliticalAmountRange(value: string | number | null | undefined): ParsedAmountRange {
  if (typeof value === "number" && Number.isFinite(value)) return { min: value, max: value, estimated: value, method: "EXACT" };
  const raw = typeof value === "string" ? value.trim() : "";
  if (!raw) return { min: null, max: null, estimated: null, method: "UNKNOWN" };
  const numbers = raw.match(/\$?\s*[\d,.]+(?:\.\d+)?\s*[KMB]?/gi)?.map(amountNumber).filter((item: number | null): item is number => item !== null) ?? [];
  if (!numbers.length) return { min: null, max: null, estimated: null, method: "UNKNOWN" };
  if (/over|more than|greater than|>\s*\$?/i.test(raw) && numbers.length === 1) return { min: numbers[0]!, max: numbers[0]!, estimated: numbers[0]!, method: "MIDPOINT_ESTIMATE" };
  if (/under|less than|<\s*\$?/i.test(raw) && numbers.length === 1) return { min: 0, max: numbers[0]!, estimated: numbers[0]! / 2, method: "MIDPOINT_ESTIMATE" };
  if (numbers.length === 1) return { min: numbers[0]!, max: numbers[0]!, estimated: numbers[0]!, method: "EXACT" };
  const min = Math.min(numbers[0]!, numbers[1]!); const max = Math.max(numbers[0]!, numbers[1]!);
  return { min, max, estimated: (min + max) / 2, method: "MIDPOINT_ESTIMATE" };
}

export function disclosureDelayDays(transactionDate: string, disclosureDate: string) {
  const transaction = Date.parse(`${transactionDate.slice(0, 10)}T00:00:00Z`);
  const disclosure = Date.parse(`${disclosureDate.slice(0, 10)}T00:00:00Z`);
  if (!Number.isFinite(transaction) || !Number.isFinite(disclosure)) return 0;
  return Math.max(0, Math.round((disclosure - transaction) / 86_400_000));
}

export function politicalTransactionFingerprint(input: Pick<PoliticalTransaction, "politicianId" | "chamber" | "assetName" | "rawTicker" | "transactionDate" | "transactionType" | "amountMin" | "amountMax" | "ownerType">) {
  const assetIdentity = (input.rawTicker ?? input.assetName).normalize("NFKD").replace(/[^a-zA-Z0-9]/g, "").toLowerCase();
  return stablePoliticalId(input.politicianId, input.chamber, assetIdentity, input.transactionDate, input.transactionType, input.amountMin?.toString() ?? null, input.amountMax?.toString() ?? null);
}

export function deduplicatePoliticalTransactions(transactions: PoliticalTransaction[]) {
  const byFingerprint = new Map<string, PoliticalTransaction>();
  for (const transaction of transactions) {
    const existing = byFingerprint.get(transaction.fingerprint);
    if (!existing || transaction.amendment || transaction.disclosureDate > existing.disclosureDate) byFingerprint.set(transaction.fingerprint, transaction);
  }
  const data = [...byFingerprint.values()].sort((a, b) => b.disclosureDate.localeCompare(a.disclosureDate));
  const canonicalByCore = new Map(data.map((row) => [stablePoliticalId(row.politicianId, row.chamber, (row.rawTicker ?? row.assetName).normalize("NFKD").replace(/[^a-zA-Z0-9]/g, "").toLowerCase(), row.transactionDate, row.transactionType, row.amountMin?.toString() ?? null, row.amountMax?.toString() ?? null), row.fingerprint]));
  const sourceRows = transactions.map((row) => ({ ...row, fingerprint: canonicalByCore.get(stablePoliticalId(row.politicianId, row.chamber, (row.rawTicker ?? row.assetName).normalize("NFKD").replace(/[^a-zA-Z0-9]/g, "").toLowerCase(), row.transactionDate, row.transactionType, row.amountMin?.toString() ?? null, row.amountMax?.toString() ?? null)) ?? row.fingerprint }));
  const providerSets = new Map<string, Set<PoliticalTransaction["provider"]>>(); for (const row of sourceRows) providerSets.set(row.fingerprint, new Set([...(providerSets.get(row.fingerprint) ?? []), row.provider]));
  const mergedData = data.map((row) => { const providers = providerSets.get(row.fingerprint) ?? new Set([row.provider]); const matched = providers.has("fmp") && providers.has("bargo"); return matched ? { ...row, verificationStatus: "BARGO_FMP_MATCH" as const } : row; });
  return { data: mergedData, sourceRows, duplicatesRemoved: transactions.length - mergedData.length, duplicateRate: transactions.length ? (transactions.length - mergedData.length) / transactions.length * 100 : 0 };
}
