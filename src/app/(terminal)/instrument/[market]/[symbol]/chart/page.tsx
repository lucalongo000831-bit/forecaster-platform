import { LivePriceChart } from "@/components/financial/live-price-chart";
import { formatCompactNumber, formatCurrency } from "@/lib";
import { financialDataService } from "@/services";

export default async function InstrumentChartPage({ params }: { params: Promise<{ market: string; symbol: string }> }) {
  const ref = await params;
  const [overview, instrument] = await Promise.all([financialDataService.getOverview(ref), financialDataService.getInstrument(ref)]);
  return <div className="container-shell page-stack"><LivePriceChart symbol={instrument.symbol} initialData={overview.priceSeries} referenceValue={instrument.quote.price} initialSource={overview.source}/><div className="grid-3"><div className="soft-card p-6"><span className="small-label">Open</span><div className="kpi mt-2">{instrument.quote.open === undefined ? "Dato non disponibile" : formatCurrency(instrument.quote.open, instrument.currency)}</div></div><div className="soft-card p-6"><span className="small-label">Day range</span><div className="kpi mt-2">{formatCurrency(instrument.quote.dayLow, instrument.currency)}–{formatCurrency(instrument.quote.dayHigh, instrument.currency)}</div></div><div className="soft-card p-6"><span className="small-label">Volume</span><div className="kpi mt-2">{instrument.quote.volume ? formatCompactNumber(instrument.quote.volume) : "Dato non disponibile"}</div></div></div></div>;
}
