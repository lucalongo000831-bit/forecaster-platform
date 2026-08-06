import { MainPriceChart } from "@/components/charts/market-charts";
import { RangeControls } from "@/components/ui/interactive-controls";
import { formatCompactNumber, formatCurrency } from "@/lib";
import { financialDataService } from "@/services";

export default async function InstrumentChartPage({ params }: { params: Promise<{ market: string; symbol: string }> }) {
  const ref = await params;
  const [overview, instrument] = await Promise.all([financialDataService.getOverview(ref), financialDataService.getInstrument(ref)]);
  return <div className="container-shell page-stack"><section><div className="section-row"><div><span className="section-pill">Interactive Price Chart</span><p className="muted mt-3">Mock price and volume history · last close {formatCurrency(instrument.quote.price, instrument.currency)}</p></div><RangeControls/></div><MainPriceChart data={overview.priceSeries} referenceValue={instrument.quote.price}/></section><div className="grid-3"><div className="soft-card p-6"><span className="small-label">Open</span><div className="kpi mt-2">{formatCurrency(instrument.quote.price - instrument.quote.change, instrument.currency)}</div></div><div className="soft-card p-6"><span className="small-label">Day range</span><div className="kpi mt-2">{formatCurrency(instrument.quote.dayLow, instrument.currency)}–{formatCurrency(instrument.quote.dayHigh, instrument.currency)}</div></div><div className="soft-card p-6"><span className="small-label">Volume</span><div className="kpi mt-2">{formatCompactNumber(instrument.quote.volume)}</div></div></div></div>;
}
