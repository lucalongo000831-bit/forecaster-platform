import { describe, expect, it } from "vitest";
import { watermarkCovers } from "./calendar-repository";

describe("calendar verified-zero watermark", () => {
  it("accepts a successful source window that covers the requested interval", () => {
    expect(watermarkCovers({ from: "2026-07-01", to: "2026-10-31" }, "2026-08-01", "2026-08-31")).toBe(true);
  });

  it("does not reuse a verified zero from a different interval", () => {
    expect(watermarkCovers({ from: "2026-07-01", to: "2026-07-31" }, "2026-08-01", "2026-08-31")).toBe(false);
  });
});
