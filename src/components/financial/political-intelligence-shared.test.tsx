import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { PoliticalActivityEngine } from "@/engines/political/activity-engine";
import { PoliticalScoreCard, PoliticalTransactionTable } from "./political-intelligence-shared";

describe("political intelligence unavailable states", () => {
  it("does not present missing disclosures as verified zero activity", () => {
    const summary = new PoliticalActivityEngine().summarize([], "90D", [], new Date("2026-08-11T12:00:00.000Z"));
    const markup = renderToStaticMarkup(<PoliticalScoreCard summary={summary} />);

    expect(markup).toContain("DATA UNAVAILABLE");
    expect(markup).toContain("not treated as an officially verified zero");
    expect(markup).not.toContain("0% COVERAGE");
    expect(markup).not.toContain("<strong>0</strong><span>/100</span>");
  });

  it("explains an empty provider result in the disclosure table", () => {
    const markup = renderToStaticMarkup(<PoliticalTransactionTable transactions={[]} />);

    expect(markup).toContain("No provider-reported disclosures");
    expect(markup).toContain("not treated as an officially verified zero");
  });
});
