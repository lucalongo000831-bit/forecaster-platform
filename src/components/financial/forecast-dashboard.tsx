"use client";

import { useCallback, useState } from "react";
import { Activity, RefreshCw, Sigma } from "lucide-react";
import type { ForecastAnalysis, ForecastHorizon } from "@/engines/forecast";
import { formatCurrency, formatPercent } from "@/lib";
import { ForecastDistributionChart } from "@/components/charts/market-charts";
import { DataError, DataUnavailable } from "./data-state";

const horizons: ForecastHorizon[] = ["1d", "5d", "10d", "20d", "1m", "3m", "6m", "12m"];
const money = (value: number | null, currency: string) => value === null ? "N/D" : formatCurrency(value, currency);

export function ForecastDashboard({ symbol, initial }: { symbol: string; initial: ForecastAnalysis | null }) {
  const [data, setData] = useState(initial);
  const [horizon, setHorizon] = useState<ForecastHorizon>(initial?.horizon ?? "1m");
  const [loading, setLoading] = useState(false); const [error, setError] = useState<string | null>(null);
  const load = useCallback(async (next: ForecastHorizon) => {
    setHorizon(next); setLoading(true); setError(null);
    try { const response = await fetch(`/api/analysis/forecast?symbol=${encodeURIComponent(symbol)}&horizon=${next}`); const body = await response.json() as { data?: ForecastAnalysis; error?: { message?: string } }; if (!response.ok || !body.data) throw new Error(body.error?.message ?? "Forecast non disponibile."); setData(body.data); }
    catch (requestError) { setError(requestError instanceof Error ? requestError.message : "Forecast non disponibile."); }
    finally { setLoading(false); }
  }, [symbol]);
  return <div className="container-shell page-stack">
    <header className="section-row"><div><span className="page-kicker">Quant lab / Probability, not certainty</span><h1 className="page-title">Forecast distribution.</h1><p className="muted mt-3">Bootstrap, Monte Carlo and realized walk-forward error in one transparent range.</p></div><nav className="segmented">{horizons.map((item) => <button key={item} disabled={loading} className={horizon === item ? "active" : ""} onClick={() => void load(item)}>{item.toUpperCase()}</button>)}</nav></header>
    {error && <div><DataError message={error}/><button className="button-soft mt-3" onClick={() => void load(horizon)}><RefreshCw size={16}/>Riprova</button></div>}
    {!data && !loading && <DataUnavailable title="Forecast non disponibile" detail="Servono almeno 130 osservazioni storiche valide."/>}
    {data && <div className={loading ? "grid gap-7 opacity-50" : "grid gap-7"}>
      <section className="grid gap-6 lg:grid-cols-[1.25fr_0.75fr]"><div><div className="section-row"><div><span className="small-label">Terminal-price distribution · {data.horizonDays} trading days</span><h2 className="mt-1 text-xl font-bold">Percentile range</h2></div><span className="badge bg-indigo-50 text-indigo-700">{data.simulations.toLocaleString("it-IT")} simulations</span></div><ForecastDistributionChart data={data.distribution} currentPrice={data.currentPrice}/></div><div className="soft-card p-7 text-center"><span className="small-label">Median scenario</span><div className="mt-3 text-4xl font-bold">{money(data.percentiles.p50, data.currency)}</div><p className={`mt-2 font-bold ${data.expectedReturn >= 0 ? "positive" : "negative"}`}>{formatPercent(data.expectedReturn, true)} expected mean return</p><div className="mt-7 grid grid-cols-2 gap-4 text-left"><span><small className="muted">P10</small><strong className="block">{money(data.percentiles.p10, data.currency)}</strong></span><span><small className="muted">P90</small><strong className="block">{money(data.percentiles.p90, data.currency)}</strong></span><span><small className="muted">Above current</small><strong className="block">{data.probabilityAboveCurrentPrice.toFixed(1)}%</strong></span><span><small className="muted">Below current</small><strong className="block">{data.probabilityBelowCurrentPrice.toFixed(1)}%</strong></span></div></div></section>
      <section className="grid-3"><div className="soft-card p-6"><span className="small-label">Above target</span><div className="kpi mt-2 text-black">{data.probabilityAboveTarget === null ? "N/D" : `${data.probabilityAboveTarget.toFixed(1)}%`}</div><p className="muted mt-2">Target {money(data.targetPrice, data.currency)}</p></div><div className="soft-card p-6"><span className="small-label">Below stop</span><div className="kpi mt-2 text-black">{data.probabilityBelowStop === null ? "N/D" : `${data.probabilityBelowStop.toFixed(1)}%`}</div><p className="muted mt-2">Stop {money(data.stopPrice, data.currency)}</p></div><div className="soft-card p-6"><span className="small-label">Model confidence</span><div className="kpi mt-2 text-black">{data.confidence.toFixed(0)}%</div><p className="muted mt-2">{data.sampleSize.toLocaleString("it-IT")} historical returns</p></div></section>
      <section className="grid-2"><div className="card p-6"><h2 className="flex items-center gap-2 text-xl font-bold"><Activity className="text-indigo-500"/>Historical validation</h2><dl className="mt-5 grid grid-cols-2 gap-3"><dt>Walk-forward MAE</dt><dd>{data.modelError === null ? "N/D" : `${data.modelError.toFixed(2)}%`}</dd><dt>Validation windows</dt><dd>{data.backtestCoverage.windows}</dd><dt>Coverage</dt><dd>{data.backtestCoverage.coveragePercent.toFixed(0)}%</dd><dt>Data timestamp</dt><dd>{new Date(data.dataTimestamp).toLocaleDateString("it-IT")}</dd></dl></div><div className="card p-6"><h2 className="flex items-center gap-2 text-xl font-bold"><Sigma className="text-indigo-500"/>Methods & assumptions</h2><ul className="muted mt-5 grid gap-2 text-sm">{[...data.methods, ...data.assumptions].map((item) => <li key={item}>• {item}</li>)}</ul></div></section>
      <p className="muted text-xs">{data.disclaimer} · {data.modelVersion}</p>
    </div>}
    {loading && !data && <div className="soft-card p-12 text-center muted">Simulazione della distribuzione in corso…</div>}
  </div>;
}
