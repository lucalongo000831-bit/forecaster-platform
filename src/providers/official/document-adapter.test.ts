import { describe, expect, it } from "vitest";
import { parseOfficialAutomotiveFiling } from "./document-adapter";

const row = (label: string, ...values: string[]) => `<tr><td>${label}</td>${values.map((value) => `<td>${value}</td>`).join("")}</tr>`;

describe("official issuer document adapter", () => {
  it("extracts special automotive metrics without mixing industrial and consolidated values", () => {
    const html = `<html><head><title>stellantis-20251231</title></head><body>
      <table><tr><th>Net revenues</th></tr>${row("Adjusted operating income/(loss)", "(842)", "8,648", "(110)%")}</table>
      <table><tr><th>Cash flows from operating activities</th></tr>${row("Industrial free cash flows", "(4,525)", "(6,045)")}</table>
      <table><tr><th>Industrial activities</th><th>Financial services</th></tr>${row("Net financial position", "(13,655)", "6,694", "(20,349)", "2,406", "15,128", "(12,722)")}</table>
      <table>${row("Total Consolidated shipments", "5,484", "5,415")}${row("Joint venture shipments", "89", "111")}</table>
      <table><tr><th>Net revenues</th><th>Adjusted operating income/(loss)</th><th>Shipments</th></tr>${row("North America", "60,962", "63,450", "(1,892)", "2,660", "1,472", "1,432")}</table>
      <p>Luxury vehicles under the Maserati brand; (ii) premium vehicles covered by Alfa Romeo, DS and Lancia brands; (iii) global sport utility vehicles under the Jeep brand; (iv) American brands covering Dodge, Ram and Chrysler vehicles and (v) European brands covering Abarth, Citroën, FIAT, Opel, Peugeot and Vauxhall vehicles.</p>
      <p>Stellantis centralizes design, engineering, development and manufacturing operations. Stellantis also provides retail and dealer financing, leasing and rental services.</p>
    </body></html>`;
    const result = parseOfficialAutomotiveFiling(html, { issuerId: "0001605484", publicationDate: "2026-02-26", sourceUrl: "https://www.sec.gov/Archives/edgar/data/1605484/test.htm" });
    expect(result.adjustedOperatingIncome).toBe(-842_000_000);
    expect(result.industrialFreeCashFlow).toBe(-4_525_000_000);
    expect(result.industrialNetFinancialPosition).toBe(6_694_000_000);
    expect(result.consolidatedShipments).toBe(5_484_000);
    expect(result.segments[0]).toMatchObject({ name: "North America", revenue: 60_962_000_000, adjustedOperatingIncome: -1_892_000_000, shipments: 1_472_000 });
    expect(result.brandPortfolio).toHaveLength(14);
    expect(result.brandPortfolio).toContain("Citroën");
    expect(result.centralizedDesignAndManufacturing).toBe(true);
    expect(result.dealerFinanceOffering).toBe(true);
    expect(result.document.hash).toHaveLength(64);
  });
});
