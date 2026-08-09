import { describe, expect, it } from "vitest";
import { analyzeDividends, analyzeInsiderActivity } from "./ownership-dividend";

describe("ownership and dividend analytics", () => {
  it("distinguishes acquisitions from dispositions", () => { expect(analyzeInsiderActivity([{ shares: 100, acquiredDisposed: "A" }, { shares: 25, acquiredDisposed: "D" }])).toMatchObject({ netShares: 75, purchases: 1, sales: 1 }); });
  it("derives trailing dividend amount only from real events", () => { expect(analyzeDividends([{ date: "2025-03-01", amount: 1 }, { date: "2026-03-01", amount: 1.1 }]).trailingAmount).toBe(1.1); });
});
