const CORPORATE_TYPES = new Set(["EQUITY", "STOCK"]);
const NON_CORPORATE_TYPES = new Set([
  "CRYPTOCURRENCY",
  "CURRENCY",
  "ETF",
  "FUTURE",
  "INDEX",
  "MONEYMARKET",
  "MUTUALFUND",
  "OPTION",
]);

function normalizedType(value: string | null | undefined): string | null {
  const normalized = value?.trim().toUpperCase();
  return normalized || null;
}

function inferredFundType(name: string | null | undefined): string | null {
  const normalized = name?.trim().toUpperCase();
  if (!normalized) return null;
  return /\bETF\b|\bEXCHANGE[- ]TRADED FUND\b|\bSPDR\b|\bISHARES\b/.test(normalized) ? "ETF" : null;
}

export function classifyCompanyInstrument(
  symbol: string,
  profileType?: string | null,
  quoteType?: string | null,
  profileName?: string | null,
): { instrumentType: string; applicable: boolean } {
  const normalizedSymbol = symbol.toUpperCase();
  const reportedTypes = [normalizedType(profileType), normalizedType(quoteType)].filter(
    (value): value is string => Boolean(value),
  );
  const reportedNonCorporateType = reportedTypes.find((value) => NON_CORPORATE_TYPES.has(value));

  if (reportedNonCorporateType) return { instrumentType: reportedNonCorporateType, applicable: false };
  const inferredType = inferredFundType(profileName);
  if (inferredType) return { instrumentType: inferredType, applicable: false };
  if (normalizedSymbol.startsWith("^")) return { instrumentType: "INDEX", applicable: false };
  if (normalizedSymbol.endsWith("-USD")) return { instrumentType: "CRYPTOCURRENCY", applicable: false };
  if (normalizedSymbol.endsWith("=X")) return { instrumentType: "CURRENCY", applicable: false };
  if (normalizedSymbol.includes("=")) return { instrumentType: "FUTURE", applicable: false };

  const instrumentType = reportedTypes[0] ?? "UNKNOWN";
  return { instrumentType, applicable: CORPORATE_TYPES.has(instrumentType) };
}
