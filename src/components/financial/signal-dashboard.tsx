"use client";

import { useCallback, useState } from "react";
import { AlertTriangle, CheckCircle2, RefreshCw, ShieldCheck, Sparkles } from "lucide-react";
import type { SignalAnalysis, SignalHorizon } from "@/engines/signals";
import { DataError, DataUnavailable } from "./data-state";

const horizons: Array<{ value: SignalHorizon; label: string }> = [
  { value: "intraday", label: "Intraday" }, { value: "1d", label: "1D" }, { value: "1w", label: "1W" }, { value: "1m", label: "1M" },
  { value: "3m", label: "3M" }, { value: "6m", label: "6M" }, { value: "12m", label: "12M" }, { value: "long", label: "Long" },
];

function readableCategory(category: SignalAnalysis["category"]) { return category?.replaceAll("_", " ") ?? "NON DISPONIBILE"; }
function scoreTone(score: number | null) { return score === null ? "text-slate-500" : score >= 60 ? "positive" : score < 40 ? "negative" : "text-amber-600"; }

export function SignalDashboard({ symbol, initial }: { symbol: string; initial: SignalAnalysis | null }) {
  const [data, setData] = useState(initial);
  const [horizon, setHorizon] = useState<SignalHorizon>(initial?.horizon ?? "1m");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (nextHorizon: SignalHorizon) => {
    setHorizon(nextHorizon); setLoading(true); setError(null);
    try {
      const response = await fetch(`/api/analysis/signal?symbol=${encodeURIComponent(symbol)}&horizon=${nextHorizon}`);
      const body = await response.json() as { data?: SignalAnalysis; error?: { message?: string } };
      if (!response.ok || !body.data) throw new Error(body.error?.message ?? "Segnale temporaneamente non disponibile.");
      setData(body.data);
    } catch (requestError) { setError(requestError instanceof Error ? requestError.message : "Segnale temporaneamente non disponibile."); }
    finally { setLoading(false); }
  }, [symbol]);

  return <div className="container-shell page-stack">
    <header className="section-row">
      <div><span className="page-kicker">Quant lab / Multi-factor model</span><h1 className="page-title">Signal intelligence.</h1><p className="muted mt-3">Pesi specifici per orizzonte, fattori rinormalizzati e regime di mercato esplicito.</p></div>
      <nav className="segmented" aria-label="Signal horizon">{horizons.map((item) => <button key={item.value} disabled={loading} className={horizon === item.value ? "active" : ""} onClick={() => void load(item.value)}>{item.label}</button>)}</nav>
    </header>
    {error && <div><DataError message={error}/><button className="button-soft mt-3" onClick={() => void load(horizon)}><RefreshCw size={16}/>Riprova</button></div>}
    {!data && !loading && <DataUnavailable title="Segnale non disponibile" detail="Non è stato possibile ottenere dati finanziari sufficienti dai provider configurati."/>}
    {data && <div className={loading ? "grid gap-7 opacity-50" : "grid gap-7"} aria-busy={loading}>
      <section className="grid gap-6 lg:grid-cols-[0.8fr_1.2fr]">
        <div className="soft-card grid place-items-center p-8 text-center">
          <span className="small-label">Composite signal · {data.horizon}</span>
          <div className={`mt-4 text-5xl font-bold ${scoreTone(data.score)}`}>{data.score === null ? "—" : data.score.toFixed(1)}</div>
          <strong className={`mt-3 text-xl ${scoreTone(data.score)}`}>{readableCategory(data.category)}</strong>
          <div className="mt-6 h-2 w-full max-w-72 overflow-hidden rounded-full bg-slate-200"><span className="block h-full rounded-full bg-gradient-to-r from-red-500 via-amber-400 to-emerald-500" style={{ width: `${data.score ?? 0}%` }}/></div>
          <p className="muted mt-4">Confidence {data.confidence.toFixed(0)}% · completeness {data.completeness.toFixed(0)}%</p>
        </div>
        <div className="card p-6">
          <div className="section-row"><div><span className="small-label">Factor contribution</span><h2 className="mt-1 text-xl font-bold">What drives the signal</h2></div><span className="badge bg-indigo-50 text-indigo-700">{data.modelVersion}</span></div>
          <div className="grid gap-4">{data.components.filter((component) => component.configuredWeight > 0).map((component) => <div key={component.key}>
            <div className="mb-2 flex items-center justify-between gap-4 text-sm"><span><strong>{component.label}</strong><small className="muted ml-2">{(component.effectiveWeight * 100).toFixed(0)}% eff.</small></span><strong className={scoreTone(component.score)}>{component.score === null ? "N/D" : component.score.toFixed(1)}</strong></div>
            <div className="h-2 overflow-hidden rounded-full bg-slate-100"><span className="block h-full rounded-full bg-indigo-500" style={{ width: `${component.score ?? 0}%` }}/></div>
          </div>)}</div>
        </div>
      </section>
      {data.category === null && <DataUnavailable title="Completezza insufficiente" detail={data.reasons.join(" ")}/>} 
      <section className="grid-3">
        <div className="soft-card p-6"><span className="small-label">Market regime</span><div className="kpi mt-2 text-black">{data.regime.regime.replaceAll("_", " ")}</div><p className="muted mt-2">{data.regime.riskAppetite.replaceAll("_", " ")} · confidence {data.regime.confidence.toFixed(0)}%</p></div>
        <div className="soft-card p-6"><span className="small-label">Input sample</span><div className="kpi mt-2 text-black">{data.sampleSize.toLocaleString("it-IT")}</div><p className="muted mt-2">Price observations used by the technical engine</p></div>
        <div className="soft-card p-6"><span className="small-label">Historical hit rate</span><div className="kpi mt-2 text-black">N/D</div><p className="muted mt-2">Will appear only after walk-forward validation</p></div>
      </section>
      <section className="grid-2">
        <div className="card p-6"><h2 className="flex items-center gap-2 text-xl font-bold"><Sparkles className="text-indigo-500" size={20}/>Key reasons</h2><ul className="mt-5 grid gap-3">{data.reasons.map((reason) => <li className="flex gap-3" key={reason}><CheckCircle2 className="mt-0.5 shrink-0 text-emerald-500" size={17}/><span>{reason}</span></li>)}</ul></div>
        <div className="card p-6"><h2 className="flex items-center gap-2 text-xl font-bold"><AlertTriangle className="text-amber-500" size={20}/>Invalidation conditions</h2><ul className="mt-5 grid gap-3">{data.invalidations.map((reason) => <li className="flex gap-3" key={reason}><ShieldCheck className="mt-0.5 shrink-0 text-indigo-500" size={17}/><span>{reason}</span></li>)}</ul></div>
      </section>
      <p className="muted text-xs">{data.disclaimer} · Input timestamp {new Date(data.dataTimestamp).toLocaleString("it-IT")}.</p>
    </div>}
    {loading && !data && <div className="soft-card p-12 text-center muted">Calcolo del segnale in corso…</div>}
  </div>;
}
