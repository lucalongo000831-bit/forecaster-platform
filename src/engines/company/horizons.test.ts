import { describe, expect, it } from "vitest";
import { analyzeTimeHorizons } from "./horizons";

describe("company horizon assessments", () => {
  it("widens uncertainty and avoids deterministic long-term targets", () => {
    const result = analyzeTimeHorizons({ currentPrice: 100, qualityScore: 80, technicalScore: 65, riskScore: 35, historicalGrowth: 0.08, valuation: null, asOf: "2026-01-01" });
    expect(result).toHaveLength(12);
    const oneYear = result.find((item) => item.horizon === "1Y")!;
    const twenty = result.find((item) => item.horizon === "20Y")!;
    expect(oneYear.centralTarget).not.toBeNull();
    expect(twenty.centralTarget).toBeNull();
    expect((twenty.bull as number) - (twenty.bear as number)).toBeGreaterThan((oneYear.bull as number) - (oneYear.bear as number));
    expect(twenty.confidence).toBe("VERY_LOW");
  });
});
