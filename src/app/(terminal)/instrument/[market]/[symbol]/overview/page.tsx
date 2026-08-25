import { DividendChart, DrawdownChart, MainPriceChart } from "@/components/charts/lightweight/lightweight-financial-charts";
import { AnnualPerformanceChart } from "@/components/charts/market-charts";
import { InsiderTable } from "@/components/financial/financial-tables";
import { Footer } from "@/components/shell/footer";
import { RangeControls } from "@/components/ui/interactive-controls";
import { formatPercent } from "@/lib";
import { financialDataService } from "@/services";
import { DataSourceNotice, DataUnavailable } from "@/components/financial/data-state";

export default async function OverviewPage({ params }: { params: Promise<{ market: string; symbol: string }> }) {
  const ref = await params;
  const [data, instrument] = await Promise.all([financialDataService.getOverview(ref), financialDataService.getInstrument(ref)]);
  return <>
    <div className="container-shell page-stack"><DataSourceNotice source={data.source}/>
      <section>
        <div className="section-row"><span className="section-pill">Price &amp; financial trend</span><RangeControls ranges={["Sales","Net Income","Free Cash Flow","P/E (ttm)","Dividends"]} initial="Net Income"/></div>
        <MainPriceChart data={data.priceSeries} referenceValue={instrument.quote.price} currency={instrument.currency}/>
      </section>
      <section className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        {data.returns.map(({ label, value }, index) => <div key={label} className={`card p-5 text-center ${index === 5 ? "!bg-[var(--navy)] text-white" : ""}`}><strong>{label}</strong><span className="positive mt-2 block text-2xl">{formatPercent(value, true)}</span></div>)}
      </section>
      <section><div className="section-row"><span className="section-pill">Drawdown</span></div><DrawdownChart data={data.drawdownSeries}/></section>
      <section><div className="section-row"><span className="section-pill">Years Performance</span></div><AnnualPerformanceChart data={data.annualPerformance}/></section>
      <section><div className="section-row"><span className="section-pill">Dividends</span></div>{data.dividendSeries.length ? <DividendChart data={data.dividendSeries}/> : <DataUnavailable detail="A normalized dividend event series is not available from the current provider response."/>}</section>
      <section><div className="section-row"><div><span className="section-pill">Insiders Transactions</span>{data.insiderTransactions.length > 0 && <div className="mt-4 flex gap-3"><span className="section-pill !min-h-10 !text-base">Total Activity: {data.insiderTotalActivity}</span></div>}</div></div>{data.insiderTransactions.length ? <InsiderTable transactions={data.insiderTransactions}/> : <DataUnavailable detail="Yahoo Finance does not consistently expose normalized insider transaction history for this component."/>}</section>
    </div>
    <Footer/>
  </>;
}
