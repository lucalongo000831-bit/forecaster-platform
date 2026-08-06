import { FundamentalsTabs } from "@/components/instrument/instrument-shell";
import { SummaryPanel } from "@/components/financial/fundamental-sections";
import { PeriodToggle } from "@/components/ui/interactive-controls";
import { financialDataService } from "@/services";
import { DataSourceNotice, DataUnavailable } from "@/components/financial/data-state";

export default async function StatementsPage({ params }: { params: Promise<{ market: string; symbol: string }> }) {
  const ref = await params;
  const [data, instrument] = await Promise.all([financialDataService.getFundamentals(ref), financialDataService.getInstrument(ref)]);
  return <div className="container-shell page-stack"><DataSourceNotice source={data.source}/><SummaryPanel columns={data.summaryColumns}/><FundamentalsTabs instrument={instrument}/><section><div className="section-row"><span className="section-pill">Income Statement</span><PeriodToggle/></div>{data.statementRows.length ? <div className="table-shell"><table className="data-table"><thead><tr><th>{instrument.currency} billions</th>{data.statementPeriods.map((period) => <th key={period}>{period}</th>)}</tr></thead><tbody>{data.statementRows.map((row) => <tr key={row.label}><td className="font-bold">{row.label}</td>{row.values.map((value, index) => <td key={`${row.label}-${data.statementPeriods[index]}`}>{value === null ? "—" : row.label.includes("EPS") ? value.toFixed(2) : `${value.toFixed(2)}B`}</td>)}</tr>)}</tbody></table></div> : <DataUnavailable detail="No consistently typed statement fields were returned for this symbol."/>}</section><DataUnavailable title="Statement provenance" detail="Annual statement rows are normalized server-side; missing fields remain unavailable and are never replaced with zero."/></div>;
}
