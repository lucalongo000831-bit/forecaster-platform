import { describe, expect, it } from "vitest";
import { monthWindow, requireSuccessfulPoliticalBackfill } from "./data-v2-jobs";

describe("data-v2 calendar window", () => {
  it("covers previous, current, next and following month", () => {
    expect(monthWindow(new Date("2026-08-12T12:00:00Z"))).toEqual({ from: "2026-07-01", to: "2026-10-31" });
  });
});

describe("data-v2 political job status", () => {
  it("propagates a failed provider backfill to the scheduler wrapper", () => {
    expect(() => requireSuccessfulPoliticalBackfill({ status: "FAILED" as const })).toThrow("POLITICAL_BACKFILL_FAILED");
  });

  it("preserves completed and partial resumable progress", () => {
    expect(requireSuccessfulPoliticalBackfill({ status: "COMPLETED" as const }).status).toBe("COMPLETED");
    expect(requireSuccessfulPoliticalBackfill({ status: "PARTIAL" as const }).status).toBe("PARTIAL");
  });
});
