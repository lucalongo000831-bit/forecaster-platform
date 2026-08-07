"use client";

import { Download, FileSpreadsheet, Printer } from "lucide-react";

export function CompanyReportActions({ symbol }: { symbol: string }) {
  const encoded = encodeURIComponent(symbol);
  return <div className="ci-actions">
    <a className="button-soft" href={`/api/company/${encoded}/report?format=pdf`}><Download size={16}/>PDF</a>
    <a className="button-soft" href={`/api/company/${encoded}/report?format=csv`}><FileSpreadsheet size={16}/>CSV</a>
    <button className="button-soft" type="button" onClick={() => window.print()}><Printer size={16}/>Stampa</button>
  </div>;
}
