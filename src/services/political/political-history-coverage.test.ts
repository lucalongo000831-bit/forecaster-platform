import { describe, expect, it } from "vitest";
import { politicalTransaction } from "@/engines/political/test-fixtures";
import { calculatePoliticalHistoryMonths, summarizePoliticalHistoryMonths } from "./political-history-coverage";

describe("Political monthly history coverage", () => {
  it("requires every month to be explicitly checked", () => { const row = { ...politicalTransaction(), disclosureDate: "2025-08-15" }; const months = calculatePoliticalHistoryMonths([row], "2025-08-01", "2025-10-31", ["capitol-exposed"], "2026-08-12T00:00:00Z"); expect(months.map((item) => item.status)).toEqual(["AVAILABLE", "PARTIAL", "PARTIAL"]); expect(summarizePoliticalHistoryMonths(months, "2025-08-01", "2025-10-31")).toMatchObject({ complete: true, coveredMonths: 3 }); });
  it("does not infer completion from one old record", () => { const months = calculatePoliticalHistoryMonths([], "2025-08-01", "2026-08-01", []); expect(summarizePoliticalHistoryMonths(months, "2025-08-01", "2026-08-01").complete).toBe(false); });
  it("fails the merge gate when even one target month is missing from persisted coverage", () => { const months = calculatePoliticalHistoryMonths([], "2025-08-01", "2026-08-31", ["capitol-exposed"]); expect(summarizePoliticalHistoryMonths(months.slice(1), "2025-08-01", "2026-08-31")).toMatchObject({ requiredMonths: 13, coveredMonths: 12, complete: false }); });
});
