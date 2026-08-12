import { describe, expect, it } from "vitest";
import { monthWindow } from "./data-v2-jobs";

describe("data-v2 calendar window", () => {
  it("covers previous, current, next and following month", () => {
    expect(monthWindow(new Date("2026-08-12T12:00:00Z"))).toEqual({ from: "2026-07-01", to: "2026-10-31" });
  });
});
