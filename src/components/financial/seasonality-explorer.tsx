"use client";

import { CalendarDays, Download, LineChart, PlayCircle } from "lucide-react";
import { useState } from "react";
import { SeasonalityChart } from "@/components/charts/market-charts";
import { RangeControls } from "@/components/ui/interactive-controls";
import { formatPercent } from "@/lib";
import type { ApiSuccess, SeasonalityData } from "@/types";
import type { SeasonalityAnalysis, SeasonalityWindow } from "@/engines/seasonality";
import { DataError, DataSourceNotice } from "./data-state";

const windows: SeasonalityWindow[] = ["1Y", "5Y", "10Y", "15Y", "20Y", "MAX"];

function toView(analysis: SeasonalityAnalysis): SeasonalityData {
  const best = [...analysis.monthly].filter((item) => item.mean !== null).sort((a, b) => (b.mean as number) - (a.mean as number))[0];
  const averageReturn = analysis.annualReturns.length ? analysis.annualReturns.reduce((sum, value) => sum + value, 0) / analysis.annualReturns.length : 0;
  return { series: analysis.monthly.map((item) => ({ week: (item.key - 1) * 4 + 1, current: analysis.currentYearMonthlyReturns[item.key] ?? item.mean ?? 0, average: item.mean ?? 0, analogue: item.median ?? 0 })), bestMonth: best?.label ?? "Dato non disponibile", positiveYearsPercent: analysis.annualReturns.length ? analysis.annualReturns.filter((value) => value > 0).length / analysis.annualReturns.length * 100 : 0, averageReturn, bias: averageReturn > 1 ? "Bullish" : averageReturn < -1 ? "Bearish" : "Neutral", source: "calculated", window: analysis.window, quality: analysis.quality, sampleSize: analysis.observations, disclaimer: analysis.disclaimer };
}

export function SeasonalityExplorer({ symbol, initial }: { symbol: string; initial: SeasonalityData }) {
  const [data, setData] = useState(initial); const [window, setWindow] = useState(initial.window ?? "20Y"); const [loading, setLoading] = useState(false); const [error, setError] = useState("");
  async function changeWindow(next: string) {
    setWindow(next); setLoading(true); setError("");
    try {
      const response = await fetch(`/api/analysis/seasonality?symbol=${encodeURIComponent(symbol)}&window=${encodeURIComponent(next)}`);
      const body = await response.json() as ApiSuccess<SeasonalityAnalysis> | { error?: { message?: string } };
      if (!response.ok || !("data" in body)) throw new Error("error" in body ? body.error?.message : "Seasonality unavailable");
      setData(toView(body.data));
    } catch (requestError) { setError(requestError instanceof Error ? requestError.message : "Seasonality temporarily unavailable."); }
    finally { setLoading(false); }
  }
  function download() {
    const rows = ["month,current,average,median", ...data.series.map((item, index) => `${index + 1},${item.current},${item.average},${item.analogue}`)];
    const url = URL.createObjectURL(new Blob([rows.join("\n")], { type: "text/csv" })); const anchor = document.createElement("a"); anchor.href = url; anchor.download = `${symbol}-${window}-seasonality.csv`; anchor.click(); URL.revokeObjectURL(url);
  }
  return <div className="container-shell page-stack"><DataSourceNotice source={data.source}/><section>
    <div className="section-row"><span className="section-pill">Seasonality Charts</span><div className="flex flex-wrap gap-2"><button className="button-soft" onClick={() => alert(data.disclaimer)}><PlayCircle/>Methodology note</button></div></div>
    <div className="mb-5 flex flex-wrap items-center justify-between gap-4"><div className="flex gap-2"><button className="icon-button !bg-[var(--navy)] !text-white" aria-label="Monthly chart"><LineChart/></button><button className="icon-button !bg-[var(--navy)] !text-white" aria-label="Calendar aggregation"><CalendarDays/></button><button className="icon-button" onClick={download} aria-label="Download seasonality CSV"><Download/></button></div><RangeControls ranges={windows} initial="20Y" value={window} onChange={changeWindow} disabled={loading}/></div>
    {error && <DataError message={error}/>}<p className="mb-2 text-center text-blue-700">Adjusted-close seasonality · {data.quality ?? "UNAVAILABLE"} quality · {data.sampleSize ?? 0} observations</p><div className={loading ? "opacity-50" : ""}><SeasonalityChart data={data.series}/></div>
  </section><section className="grid-3"><div className="soft-card p-6"><span className="small-label">Best historical month</span><div className="kpi positive mt-2">{data.bestMonth}</div><p className="muted mt-2">{data.positiveYearsPercent.toFixed(1)}% positive years</p></div><div className="soft-card p-6"><span className="small-label">Average annual return</span><div className="kpi positive mt-2">{formatPercent(data.averageReturn, true)}</div><p className="muted mt-2">{window} selected window</p></div><div className="soft-card p-6"><span className="small-label">Seasonal bias</span><div className="kpi mt-2">{data.bias}</div><p className="muted mt-2">Historical description, not a forecast</p></div></section></div>;
}
