import { FundamentalsTabs } from "@/components/instrument/instrument-shell";
import { SummaryPanel } from "@/components/financial/fundamental-sections";
import { PeriodToggle } from "@/components/ui/interactive-controls";
import { financialDataService } from "@/services";

export default async function StatementsPage({ params }: { params: Promise<{ market: string; symbol: string }> }) {
  const ref = await params;
  const [data, instrument] = await Promise.all([financialDataService.getFundamentals(ref), financialDataService.getInstrument(ref)]);
  return <div className="container-shell page-stack"><SummaryPanel columns={data.summaryColumns}/><FundamentalsTabs instrument={instrument}/><section><div className="section-row"><span className="section-pill">Income Statement</span><PeriodToggle/></div><div className="table-shell"><table className="data-table"><thead><tr><th>USD billions</th>{data.statementPeriods.map((period) => <th key={period}>{period}</th>)}</tr></thead><tbody>{data.statementRows.map((row) => <tr key={row.label}><td className="font-bold">{row.label}</td>{row.values.map((value, index) => <td key={`${row.label}-${data.statementPeriods[index]}`}>${value}B</td>)}</tr>)}</tbody></table></div></section><section className="grid-3">{[["Balance Sheet", "Strong"], ["Cash Flow", "$96.8B"], ["Earnings Quality", "High"]].map(([label, value]) => <div className="soft-card p-6" key={label}><span className="small-label">{label}</span><div className="kpi positive mt-3">{value}</div><p className="muted mt-3">Static mock assessment for the latest reporting period.</p></div>)}</section></div>;
}
