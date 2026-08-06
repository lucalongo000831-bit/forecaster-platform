import { FundamentalsTabs } from "@/components/instrument/instrument-shell";
import { SummaryPanel } from "@/components/financial/fundamental-sections";
import { RatioChart } from "@/components/charts/market-charts";
import { financialDataService } from "@/services";

export default async function RatiosPage({ params }: { params: Promise<{ market: string; symbol: string }> }) {
  const ref = await params;
  const [data, instrument] = await Promise.all([financialDataService.getFundamentals(ref), financialDataService.getInstrument(ref)]);
  return <div className="container-shell page-stack"><SummaryPanel columns={data.summaryColumns}/><FundamentalsTabs instrument={instrument}/><section><div className="section-row"><span className="section-pill">Valuation &amp; profitability ratios</span></div><div className="grid-3">{data.ratios.map(({ label, value, comparison }) => <div className="card p-6" key={label}><span className="small-label">{label}</span><div className="kpi mt-3">{value}</div><p className="muted mt-2">{comparison}</p></div>)}</div></section><section><div className="section-row"><span className="section-pill">Ratio History</span></div><RatioChart data={data.financials}/></section></div>;
}
