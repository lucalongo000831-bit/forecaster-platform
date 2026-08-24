import { AdvancedDpoChart, OscillatorChart } from "@/components/charts/lightweight/lightweight-financial-charts";
import { MarketGauge } from "@/components/charts/market-charts";
import { Footer } from "@/components/shell/footer";
import { RangeControls } from "@/components/ui/interactive-controls";
import { financialDataService } from "@/services";

export default async function ObosPage({ params }: { params: Promise<{ market: string; symbol: string }> }) {
  const data = await financialDataService.getMomentum(await params);
  return <><div className="container-shell page-stack"><section className="grid-2 items-center"><MarketGauge mood={data.mood}/><div><div className="grid-3">{data.metrics.map(({ label, value }) => <div className="card p-8 text-center" key={label}><span>{label}</span><div className="kpi mt-2 text-black">{value.toFixed(1)}</div><div className="mt-5 h-2 rounded-full bg-gradient-to-r from-green-400 via-blue-400 to-red-500"/></div>)}</div><div className="soft-card mt-6 p-8 text-center"><div className="mx-auto max-w-48 rounded-xl bg-blue-200 p-4"><span>Market Mood Meter</span><div className="text-4xl font-bold">{data.mood}</div></div><p className="mt-4 text-xl">({data.mood}) {data.assessment}</p></div></div></section>
    <section><div className="section-row"><span className="section-pill">Advanced DPO</span><RangeControls ranges={["10Y","5Y","3Y","1Y","6M","1M"]} initial="3Y"/></div><AdvancedDpoChart data={data.dpoSeries}/></section>
    <section><div className="section-row"><nav className="segmented"><button className="active">Market Mood Meter</button><button>Wyckoff Causes/Effects</button><button>Speed</button></nav></div><OscillatorChart data={data.oscillatorSeries}/></section>
  </div><Footer/></>;
}
