import type { CompanySource, ResolvedInstrument } from "@/types";

interface OfficialSourceRecord {
  cik: string;
  sources: CompanySource[];
}

const officialSources: OfficialSourceRecord[] = [
  {
    cik: "0001605484",
    sources: [
      { provider: "Stellantis Investor Relations", label: "Official investor relations and financial reports", url: "https://www.stellantis.com/en/investors", timestamp: null, kind: "FACT" },
      { provider: "Stellantis Investor Relations", label: "Official stock, listing and shareholder information", url: "https://www.stellantis.com/en/investors/stock-and-shareholder-info/stock-info", timestamp: null, kind: "FACT" },
      { provider: "Stellantis Investor Relations", label: "Stellantis 2025 Annual Report", url: "https://www.stellantis.com/content/dam/stellantis-corporate/investors/financial-reports/Stellantis-NV-20251231-Annual-Report.pdf", timestamp: "2026-02-26", kind: "FACT" },
      { provider: "SEC EDGAR", label: "Stellantis N.V. SEC filings (CIK 0001605484)", url: "https://www.sec.gov/edgar/browse/?CIK=0001605484", timestamp: null, kind: "FACT" },
    ],
  },
];

export function officialIssuerSources(instrument: ResolvedInstrument | null): CompanySource[] {
  if (!instrument?.issuer?.cik) return [];
  return officialSources.find((record) => record.cik === instrument.issuer?.cik)?.sources.map((source) => ({ ...source })) ?? [];
}
