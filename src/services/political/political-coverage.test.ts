import { describe, expect, it } from "vitest";
import { politicalTransaction } from "@/engines/political/test-fixtures";
import { politicalCoverage } from "./political-coverage";

const now = new Date("2026-08-12T12:00:00Z");
const healthy = { databaseStatus: "AVAILABLE", fmpStatus: "OK", earliestDisclosure: "2025-08-01", latestDisclosure: "2026-08-12", totalRecords: 1_000, mappingRate: 99.2 };

describe("political result status", () => {
  it("reports verified activity when matching records exist", () => expect(politicalCoverage("90D", [politicalTransaction()], [politicalTransaction()], healthy, now).status).toBe("VERIFIED_ACTIVITY"));
  it("reports verified zero only with healthy history and mapping", () => expect(politicalCoverage("90D", [], [politicalTransaction()], healthy, now).status).toBe("VERIFIED_ZERO"));
  it("does not turn incomplete coverage into a false zero", () => expect(politicalCoverage("1Y", [], [politicalTransaction()], { ...healthy, earliestDisclosure: "2026-07-01", mappingRate: 81 }, now).status).toBe("PARTIAL_DATA"));
  it("reports initialization before any successful ingestion", () => expect(politicalCoverage("90D", [], [], { ...healthy, earliestDisclosure: null, latestDisclosure: null, totalRecords: 0, mappingRate: 0, fmpStatus: "NOT_SYNCED" }, now).status).toBe("DATASET_INITIALIZING"));
});
