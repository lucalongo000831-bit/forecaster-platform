import type { PoliticalHistoryMonthCoverage, PoliticalTransaction } from "@/types";

function monthStart(value: string) { return `${value.slice(0, 7)}-01`; }
function nextMonth(value: string) { const date = new Date(`${monthStart(value)}T00:00:00Z`); date.setUTCMonth(date.getUTCMonth() + 1); return date.toISOString().slice(0, 7); }
export function monthKeys(from: string, to: string) { const keys: string[] = []; for (let value = from.slice(0, 7); value <= to.slice(0, 7); value = nextMonth(value)) keys.push(value); return keys; }

export function calculatePoliticalHistoryMonths(rows: PoliticalTransaction[], from: string, to: string, checkedSources: string[], checkedAt = new Date().toISOString()): PoliticalHistoryMonthCoverage[] {
  return monthKeys(from, to).map((month) => { const matching = rows.filter((row) => row.disclosureDate.startsWith(month)); const sources = [...new Set(matching.map((row) => row.provider))]; const checked = checkedSources.length > 0; return { month, status: matching.length ? "AVAILABLE" as const : checked ? "PARTIAL" as const : "NOT_CHECKED" as const, recordCount: matching.length, houseRecords: matching.filter((row) => row.chamber === "HOUSE").length, senateRecords: matching.filter((row) => row.chamber === "SENATE").length, sources: [...new Set([...sources, ...checkedSources])], checkedAt: checked ? checkedAt : null }; });
}
export function summarizePoliticalHistoryMonths(months: PoliticalHistoryMonthCoverage[], from: string, to: string) {
  const required = monthKeys(from, to); const relevant = required.map((month) => months.find((item) => item.month === month)).filter(Boolean) as PoliticalHistoryMonthCoverage[];
  const covered = relevant.filter((item) => item.status === "AVAILABLE" || item.status === "PARTIAL").length;
  return { requiredMonths: required.length, coveredMonths: covered, complete: relevant.length === required.length && covered === required.length, coveragePercent: required.length ? covered / required.length * 100 : 0 };
}
