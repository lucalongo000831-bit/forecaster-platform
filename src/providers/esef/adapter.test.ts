import { describe, expect, it } from "vitest";
import { esefAdapter } from "./adapter";

const ixbrl = `<!doctype html><html xmlns:ix="http://www.xbrl.org/2013/inlineXBRL" xmlns:xbrli="http://www.xbrl.org/2003/instance"><body>
<xbrli:context id="FY"><xbrli:period><xbrli:startDate>2025-01-01</xbrli:startDate><xbrli:endDate>2025-12-31</xbrli:endDate></xbrli:period></xbrli:context>
<xbrli:unit id="EUR"><xbrli:measure>iso4217:EUR</xbrli:measure></xbrli:unit>
<ix:nonFraction name="ifrs-full:Revenue" contextRef="FY" unitRef="EUR" scale="6" decimals="-6">153508</ix:nonFraction>
<ix:nonFraction name="ifrs-full:ProfitLoss" contextRef="FY" unitRef="EUR" scale="6" sign="-">22332</ix:nonFraction>
</body></html>`;

describe("ESEF iXBRL parser", () => {
  it("extracts contexts, units, scaling and signs", () => {
    const parsed = esefAdapter.parseIxbrl(ixbrl, "https://filings.xbrl.org/example/report.xhtml");
    expect(parsed.contexts.FY?.periodEnd).toBe("2025-12-31");
    expect(parsed.units.EUR).toBe("EUR");
    expect(parsed.facts[0]).toMatchObject({ concept: "ifrs-full:Revenue", value: 153_508_000_000, unit: "EUR", periodEnd: "2025-12-31" });
    expect(parsed.facts[1]?.value).toBe(-22_332_000_000);
  });

  it("normalizes IFRS concepts with filing lineage", () => {
    const facts = esefAdapter.parseIxbrl(ixbrl, "https://filings.xbrl.org/example/report.xhtml").facts;
    const normalized = esefAdapter.normalizeOfficialFacts({ lei: "TEST", filingDate: "2026-02-26", reportingPeriodEnd: "2025-12-31", facts });
    expect(normalized.facts.revenue).toBe(153_508_000_000);
    expect(normalized.provenance[0]?.sourceConcept).toBe("ifrs-full:Revenue");
  });
});
