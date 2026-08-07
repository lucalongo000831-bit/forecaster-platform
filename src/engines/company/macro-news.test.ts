import { describe, expect, it } from "vitest";
import { analyzeMacroAndNews } from "./macro-news";

describe("company macro analysis", () => {
  it("uses qualitative sensitivity when structured exposure percentages are absent", () => {
    const result = analyzeMacroAndNews({ sector: "Energy", industry: "Oil & Gas", country: "IT", currency: "EUR", news: null });
    expect(result.macro.commoditySensitivity).toBe("HIGH");
    expect(result.macro.limitations.some((item) => item.includes("percentages"))).toBe(true);
    expect(result.macro.geopoliticalRiskScore).toBeNull();
  });
});
