import { describe, expect, it } from "vitest";
import { fredCoreMacroReleases } from "./official-adapters";

describe("FRED core macro release registry", () => {
  it("covers the required high-impact US release families with stable unique IDs", () => {
    expect(new Set(fredCoreMacroReleases.map((release) => release.id)).size).toBe(fredCoreMacroReleases.length);
    expect(fredCoreMacroReleases.map((release) => release.name)).toEqual(expect.arrayContaining([
      "Consumer Price Index",
      "Producer Price Index",
      "Employment Situation",
      "Gross Domestic Product",
      "Personal Income and Outlays",
      "Job Openings and Labor Turnover Survey",
    ]));
  });
});
