import { describe, expect, it } from "vitest";
import { advancePoliticalBackfill, initialPoliticalBackfillPage } from "./political-backfill";

describe("political backfill checkpoint", () => {
  it("resumes from a persisted page cursor", () => {
    expect(initialPoliticalBackfillPage("7", false)).toBe(7);
  });

  it("returns to page zero for daily maintenance after completion", () => {
    expect(initialPoliticalBackfillPage("19", true)).toBe(0);
  });

  it("advances until the target date is reached and then closes the cursor", () => {
    expect(advancePoliticalBackfill({ page: 3, pageRecords: 20, pageSize: 20, oldestDisclosure: "2026-03-01", targetFrom: "2025-08-12" })).toMatchObject({ complete: false, cursor: "4" });
    expect(advancePoliticalBackfill({ page: 4, pageRecords: 20, pageSize: 20, oldestDisclosure: "2025-08-01", targetFrom: "2025-08-12" })).toMatchObject({ complete: true, reachedTarget: true, cursor: "0" });
  });
});
