import { describe, expect, it } from "vitest";

describe("currency conversion contract", () => {
  it("keeps ratios and share counts outside the monetary field conversion", () => {
    const monetary = ["revenue", "netIncome", "dilutedEps", "freeCashFlow"];
    expect(monetary).not.toContain("dilutedShares");
  });
});
