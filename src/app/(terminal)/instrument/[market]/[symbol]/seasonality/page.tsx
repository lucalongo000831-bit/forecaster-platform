import { CalendarDays, Download, LineChart, PlayCircle } from "lucide-react";
import { SeasonalityChart } from "@/components/charts/market-charts";
import { RangeControls } from "@/components/ui/interactive-controls";
import { Footer } from "@/components/shell/footer";
import { formatPercent } from "@/lib";
import { financialDataService } from "@/services";
import { DataSourceNotice } from "@/components/financial/data-state";

export default async function SeasonalityPage({ params }: { params: Promise<{ market: string; symbol: string }> }) {
  const data = await financialDataService.getSeasonality(await params);
  return <><div className="container-shell page-stack"><DataSourceNotice source={data.source}/><section>
    <div className="section-row"><span className="section-pill">Seasonality Charts</span><div className="flex flex-wrap gap-2"><button className="button-soft"><PlayCircle/>5 minutes strategy</button><button className="button-soft"><PlayCircle/>Market Seasonality Full Course</button></div></div>
    <div className="mb-5 flex flex-wrap items-center justify-between gap-4"><div className="flex gap-2"><button className="icon-button !bg-[var(--navy)] !text-white"><LineChart/></button><button className="icon-button !bg-[var(--navy)] !text-white"><CalendarDays/></button><button className="icon-button"><Download/></button></div><RangeControls ranges={["1Y","5Y","10Y","15Y","20Y"]} initial="20Y"/></div>
    <p className="mb-2 text-center text-blue-700">🔎 Select a range on the chart to get in-depth statistics</p><SeasonalityChart data={data.series}/>
  </section><section className="grid-3"><div className="soft-card p-6"><span className="small-label">Best historical month</span><div className="kpi positive mt-2">{data.bestMonth}</div><p className="muted mt-2">{data.positiveYearsPercent.toFixed(1)}% positive years</p></div><div className="soft-card p-6"><span className="small-label">Average return</span><div className="kpi positive mt-2">{formatPercent(data.averageReturn, true)}</div><p className="muted mt-2">Available historical window</p></div><div className="soft-card p-6"><span className="small-label">Seasonal bias</span><div className="kpi mt-2">{data.bias}</div><p className="muted mt-2">Calculated from Yahoo monthly closes</p></div></section></div><Footer/></>;
}
