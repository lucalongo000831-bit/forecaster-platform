import { describe, expect, it } from "vitest";
import { formatUtcDateTime } from "./formatters";

describe("formatUtcDateTime", () => {
  it("formats timestamps with an explicit locale and UTC timezone", () => {
    expect(formatUtcDateTime("2026-09-12T10:08:39.000Z")).toBe("12/09/2026, 10:08:39");
  });
});
