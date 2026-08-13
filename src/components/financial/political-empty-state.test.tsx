import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { PoliticalIntelligenceReport } from "@/types";
import { PoliticalEmptyState } from "./political-empty-state";

function report(dataStatus: PoliticalIntelligenceReport["dataStatus"], overrides: Partial<PoliticalIntelligenceReport> = {}) {
  return {
    dataStatus,
    period: "90D",
    availablePeriods: [],
    activityOutsideSelectedPeriod: false,
    canonicalResolution: { matchStrategy: "CANONICAL_INSTRUMENT" },
    provenance: { sourceMode: "DATABASE", databaseStatus: "AVAILABLE" },
    ...overrides,
  } as PoliticalIntelligenceReport;
}

describe("PoliticalEmptyState", () => {
  it("labels a verified zero without claiming missing data is activity", () => {
    const markup = renderToStaticMarkup(<PoliticalEmptyState report={report("VERIFIED_ZERO")} onSelectPeriod={() => undefined}/>);
    expect(markup).toContain("No disclosed political activity");
    expect(markup).toContain("healthy, sufficiently covered database");
  });

  it("uses cautious language for partial coverage", () => {
    const markup = renderToStaticMarkup(<PoliticalEmptyState report={report("PARTIAL_DATA")} onSelectPeriod={() => undefined}/>);
    expect(markup).toContain("No definitive result");
    expect(markup).toContain("cannot be treated as a verified zero");
  });

  it("offers a period that contains real activity", () => {
    const markup = renderToStaticMarkup(<PoliticalEmptyState report={report("PARTIAL_DATA", { availablePeriods: ["1Y", "MAX"], activityOutsideSelectedPeriod: true })} onSelectPeriod={() => undefined}/>);
    expect(markup).toContain("Activity exists outside");
    expect(markup).toContain("View 1Y");
  });

  it("surfaces unresolved identity explicitly", () => {
    const markup = renderToStaticMarkup(<PoliticalEmptyState report={report("UNRESOLVED_ASSET", { canonicalResolution: null })} onSelectPeriod={() => undefined}/>);
    expect(markup).toContain("Asset identity unresolved");
  });
});
