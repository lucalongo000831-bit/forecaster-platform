import type { PoliticalDatasetCoverage, PoliticalPeriod, PoliticalResultStatus, PoliticalTransaction } from "@/types";

export interface PoliticalCoverageHealth {
  databaseStatus: string;
  fmpStatus: string;
  earliestDisclosure: string | null;
  latestDisclosure: string | null;
  totalRecords: number;
  mappingRate: number;
}

const periodDays: Record<PoliticalPeriod, number | null> = { "7D": 7, "30D": 30, "90D": 90, "6M": 183, "1Y": 365, "3Y": 1_095, "5Y": 1_826, MAX: null };

export function politicalCoverage(period: PoliticalPeriod, rows: PoliticalTransaction[], allRows: PoliticalTransaction[], health: PoliticalCoverageHealth, now = new Date()): PoliticalDatasetCoverage {
  const requestedTo = now.toISOString().slice(0, 10); const days = periodDays[period]; const requestedFrom = days === null ? null : new Date(now.getTime() - days * 86_400_000).toISOString().slice(0, 10);
  const historyDates = allRows.map((row) => row.disclosureDate).sort(); const historyFrom = health.earliestDisclosure ?? historyDates[0] ?? null; const historyTo = health.latestDisclosure?.slice(0, 10) ?? historyDates.at(-1) ?? null;
  const requiredDays = days ?? (historyFrom ? Math.max(1, Math.ceil((now.getTime() - Date.parse(`${historyFrom}T00:00:00Z`)) / 86_400_000)) : 1); const observedDays = historyFrom ? Math.max(0, Math.ceil((Date.parse(`${historyTo ?? requestedTo}T00:00:00Z`) - Date.parse(`${historyFrom}T00:00:00Z`)) / 86_400_000)) : 0;
  const historyCoveragePercent = Math.min(100, observedDays / requiredDays * 100); const ingestedRecords = Math.max(health.totalRecords, allRows.length); const mappingRate = health.mappingRate || (allRows.length ? allRows.filter((row) => row.resolutionStatus === "RESOLVED").length / allRows.length * 100 : 0); const sourceHealthy = health.databaseStatus === "AVAILABLE" && health.fmpStatus === "OK";
  let status: PoliticalResultStatus; let reason: string; let suggestedPeriod: PoliticalPeriod | null = null;
  if (rows.length) { status = health.databaseStatus === "AVAILABLE" ? "VERIFIED_ACTIVITY" : "PARTIAL_DATA"; reason = `${rows.length} public disclosure record${rows.length === 1 ? "" : "s"} matched the requested instrument and period.`; }
  else if (!ingestedRecords) { status = "DATASET_INITIALIZING"; reason = "The congressional disclosure dataset has not completed its first successful ingestion."; }
  else if (!sourceHealthy || historyCoveragePercent < 95 || mappingRate < 98) { status = "PARTIAL_DATA"; reason = `No matching record was found, but zero cannot be verified: history ${historyCoveragePercent.toFixed(0)}%, issuer mapping ${mappingRate.toFixed(1)}%.`; suggestedPeriod = period !== "1Y" && observedDays >= 365 ? "1Y" : null; }
  else { status = "VERIFIED_ZERO"; reason = "No matching public disclosure was found in a healthy, sufficiently covered dataset for this period."; }
  return { status, requestedFrom, requestedTo, historyFrom, historyTo, historyCoveragePercent, mappingRate, ingestedRecords, sourceHealthy, isLastKnownGood: false, reason, suggestedPeriod };
}
