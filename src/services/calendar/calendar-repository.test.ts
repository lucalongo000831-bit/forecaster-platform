import { describe, expect, it } from "vitest";
import { isSupportedCalendarRelease, watermarkCovers } from "./calendar-repository";

describe("calendar verified-zero watermark", () => {
  it("accepts a successful source window that covers the requested interval", () => {
    expect(watermarkCovers({ from: "2026-07-01", to: "2026-10-31" }, "2026-08-01", "2026-08-31")).toBe(true);
  });

  it("does not reuse a verified zero from a different interval", () => {
    expect(watermarkCovers({ from: "2026-07-01", to: "2026-07-31" }, "2026-08-01", "2026-08-31")).toBe(false);
  });
});

describe("calendar release allowlist", () => {
  it("accepts the core FRED registry and rejects legacy global release rows", () => {
    expect(isSupportedCalendarRelease("fred", "10:2026-08-12")).toBe(true);
    expect(isSupportedCalendarRelease("fred", "484:2026-10-01")).toBe(false);
  });

  it("preserves official central-bank providers", () => {
    expect(isSupportedCalendarRelease("federal-reserve", "FEDERAL_RESERVE:2026-09-16")).toBe(true);
    expect(isSupportedCalendarRelease("ecb", "ECB:2026-10-29")).toBe(true);
  });
});
