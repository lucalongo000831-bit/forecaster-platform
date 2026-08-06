import { Camera, PlayCircle, Star } from "lucide-react";
import { PatternChart } from "@/components/charts/market-charts";
import { PatternCasesTable } from "@/components/financial/financial-tables";
import { DateStepper, Switch } from "@/components/ui/interactive-controls";
import { formatPercent } from "@/lib";
import { financialDataService } from "@/services";
import { DataSourceNotice } from "@/components/financial/data-state";

export default async function PatternPage({ params }: { params: Promise<{ market: string; symbol: string }> }) {
  const ref = await params;
  const [data, instrument] = await Promise.all([financialDataService.getPatterns(ref), financialDataService.getInstrument(ref)]);
  return <div className="container-shell page-stack"><DataSourceNotice source={data.source}/>
    <section><div className="mb-8 flex flex-wrap items-center gap-6"><select className="h-12 min-w-44 rounded-xl border border-[var(--navy)] px-4 font-bold"><option>1 Month</option><option>3 Months</option><option>6 Months</option></select><DateStepper/><Switch label="Single Events"/><button className="button-soft ml-auto"><PlayCircle/>Pattern function Full Tutorial</button><button className="icon-button"><Camera/></button></div>
      <div className="grid gap-7 lg:grid-cols-[1fr_270px]"><PatternChart data={data.series} referenceValue={instrument.quote.price}/><aside className="grid gap-4"><div className="soft-card p-6 text-center"><strong>Probability</strong><div className="mt-4 flex items-center gap-3"><span className="positive text-xl font-bold">↑ {data.probability.bullish}%</span><div className="flex h-4 flex-1 overflow-hidden rounded-full"><span className="bg-green-500" style={{ width: `${data.probability.bullish}%` }}/><span className="flex-1 bg-red-500"/></div><span className="negative font-bold">{data.probability.bearish}% ↓</span></div><strong className="mt-7 block">Robustness</strong><div className="mt-3 flex justify-center text-blue-500">{[1,2,3,4,5].map((value) => <Star key={value} fill={value <= data.robustness ? "currentColor" : "none"}/>)}</div></div><div className="soft-card p-5 text-center"><div className="mx-auto max-w-44 rounded-xl bg-red-300 p-3"><span>The pattern is</span><div className="text-3xl font-bold">{data.strength}</div></div><p className="mt-4">{data.assessment}</p></div><div className="card p-5 text-center"><strong>Most correlated event</strong><dl className="mt-4 grid grid-cols-2 gap-2"><dt>Trade</dt><dd className="positive">{data.correlatedEvent.trade}</dd><dt>Date</dt><dd>{data.correlatedEvent.date}</dd><dt>Performance</dt><dd className="positive">{formatPercent(data.correlatedEvent.performance, true)}</dd><dt>Max Drop</dt><dd className="negative">{formatPercent(data.correlatedEvent.maxDrop)}</dd></dl></div></aside></div>
    </section><section><div className="section-row"><span className="section-pill">Historical Pattern Cases</span></div><PatternCasesTable cases={data.cases}/></section>
  </div>;
}
