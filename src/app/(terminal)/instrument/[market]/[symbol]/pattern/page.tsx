import { Camera, PlayCircle, Star } from "lucide-react";
import { PatternChart } from "@/components/charts/market-charts";
import { DataSourceNotice } from "@/components/financial/data-state";
import { PatternCasesTable } from "@/components/financial/financial-tables";
import { DateStepper, Switch } from "@/components/ui/interactive-controls";
import { formatPercent } from "@/lib";
import { financialDataService } from "@/services";

function percentOrUnavailable(value: number | null, signed = false) {
  return value === null ? "—" : formatPercent(value, signed);
}

export default async function PatternPage({ params }: { params: Promise<{ market: string; symbol: string }> }) {
  const ref = await params;
  const [data, instrument] = await Promise.all([financialDataService.getPatterns(ref), financialDataService.getInstrument(ref)]);
  const bullish = data.probability.bullish;
  const bearish = data.probability.bearish;

  return <div className="container-shell page-stack">
    <DataSourceNotice source={data.source}/>
    <section>
      <div className="mb-8 flex flex-wrap items-center gap-6">
        <select className="h-12 min-w-44 rounded-xl border border-[var(--navy)] px-4 font-bold" defaultValue="1M" aria-label="Pattern lookback">
          <option value="1M">1 Month</option><option value="3M">3 Months</option><option value="6M">6 Months</option>
        </select>
        <DateStepper/><Switch label="Single Events"/>
        <button className="button-soft ml-auto"><PlayCircle/>Pattern function Full Tutorial</button><button className="icon-button"><Camera/></button>
      </div>
      <div className="grid gap-7 lg:grid-cols-[1fr_270px]">
        <PatternChart data={data.series} referenceValue={instrument.quote.price}/>
        <aside className="grid gap-4">
          <div className="soft-card p-6 text-center">
            <strong>Probability</strong>
            <div className="mt-4 flex items-center gap-3">
              <span className="positive text-xl font-bold">↑ {bullish === null ? "—" : `${bullish}%`}</span>
              <div className="flex h-4 flex-1 overflow-hidden rounded-full" aria-label="Bullish and bearish probability">
                <span className="bg-green-500" style={{ width: `${bullish ?? 0}%` }}/><span className="flex-1 bg-red-500"/>
              </div>
              <span className="negative font-bold">{bearish === null ? "—" : `${bearish}%`} ↓</span>
            </div>
            <strong className="mt-7 block">Robustness</strong>
            <div className="mt-3 flex justify-center text-blue-500" aria-label={data.robustness === null ? "Robustness unavailable" : `Robustness ${data.robustness} out of 5`}>
              {[1, 2, 3, 4, 5].map((value) => <Star key={value} fill={data.robustness !== null && value <= data.robustness ? "currentColor" : "none"}/>)}
            </div>
          </div>
          <div className="soft-card p-5 text-center">
            <div className="mx-auto max-w-52 rounded-xl bg-red-300 p-3"><span>The pattern is</span><div className="text-2xl font-bold">{data.strength}</div></div>
            <p className="mt-4">{data.assessment}</p>
            {data.modelVersion && <small className="muted mt-3 block">{data.modelVersion} · {data.qualityStatus}</small>}
          </div>
          <div className="card p-5 text-center">
            <strong>Most correlated event</strong>
            <dl className="mt-4 grid grid-cols-2 gap-2">
              <dt>Trade</dt><dd>{data.correlatedEvent.trade}</dd>
              <dt>Date</dt><dd>{data.correlatedEvent.date}</dd>
              <dt>Similarity</dt><dd>{data.correlatedEvent.similarity === null || data.correlatedEvent.similarity === undefined ? "—" : `${data.correlatedEvent.similarity.toFixed(1)}%`}</dd>
              <dt>Performance</dt><dd>{percentOrUnavailable(data.correlatedEvent.performance, true)}</dd>
              <dt>Max Drop</dt><dd>{percentOrUnavailable(data.correlatedEvent.maxDrop)}</dd>
              <dt>Max Rise</dt><dd>{percentOrUnavailable(data.correlatedEvent.maxRise ?? null, true)}</dd>
            </dl>
          </div>
        </aside>
      </div>
    </section>
    <section><div className="section-row"><span className="section-pill">Historical Pattern Cases</span></div><PatternCasesTable cases={data.cases}/></section>
  </div>;
}
