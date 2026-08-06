"use client";

import { useCallback, useState } from "react";
import { Calculator, RefreshCw, ShieldAlert, Target } from "lucide-react";
import type { TargetAnalysis, TargetHorizon } from "@/engines/targets";
import type { RiskPlan, RiskProfile, TradeSide } from "@/engines/risk";
import { formatCurrency, formatPercent } from "@/lib";
import { DataError, DataUnavailable } from "./data-state";

const targetHorizons: TargetHorizon[] = ["3m", "6m", "12m", "long"];
const money = (value: number | null, currency: string) => value === null ? "Dato non disponibile" : formatCurrency(value, currency);

export function TargetRiskDashboard({ symbol, initial }: { symbol: string; initial: TargetAnalysis | null }) {
  const [data, setData] = useState(initial);
  const [horizon, setHorizon] = useState<TargetHorizon>(initial?.horizon ?? "12m");
  const [targetLoading, setTargetLoading] = useState(false);
  const [targetError, setTargetError] = useState<string | null>(null);
  const [side, setSide] = useState<TradeSide>("LONG");
  const [profile, setProfile] = useState<RiskProfile>("MODERATE");
  const [entry, setEntry] = useState(String(initial?.currentPrice ?? ""));
  const [account, setAccount] = useState("");
  const [riskPercent, setRiskPercent] = useState("1");
  const [risk, setRisk] = useState<RiskPlan | null>(null);
  const [riskError, setRiskError] = useState<string | null>(null);
  const [riskLoading, setRiskLoading] = useState(false);

  const loadTargets = useCallback(async (next: TargetHorizon) => {
    setHorizon(next); setTargetLoading(true); setTargetError(null);
    try {
      const response = await fetch(`/api/analysis/targets?symbol=${encodeURIComponent(symbol)}&horizon=${next}`);
      const body = await response.json() as { data?: TargetAnalysis; error?: { message?: string } };
      if (!response.ok || !body.data) throw new Error(body.error?.message ?? "Target non disponibili.");
      setData(body.data); setEntry(String(body.data.currentPrice));
    } catch (error) { setTargetError(error instanceof Error ? error.message : "Target non disponibili."); }
    finally { setTargetLoading(false); }
  }, [symbol]);

  async function calculateRisk() {
    setRiskLoading(true); setRiskError(null);
    try {
      const response = await fetch("/api/analysis/risk", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ symbol, side, entryPrice: Number(entry), horizon: "1m", riskProfile: profile, accountSize: account ? Number(account) : null, maximumRiskPercent: account ? Number(riskPercent) : null }) });
      const body = await response.json() as { data?: RiskPlan; error?: { message?: string } };
      if (!response.ok || !body.data) throw new Error(body.error?.message ?? "Piano di rischio non disponibile.");
      setRisk(body.data);
    } catch (error) { setRiskError(error instanceof Error ? error.message : "Piano di rischio non disponibile."); }
    finally { setRiskLoading(false); }
  }

  return <div className="container-shell page-stack">
    <header className="section-row"><div><span className="page-kicker">Valuation lab / Scenario planning</span><h1 className="page-title">Targets & risk.</h1><p className="muted mt-3">Analyst consensus, technical levels, fair value and risk controls—kept deliberately separate.</p></div><nav className="segmented">{targetHorizons.map((item) => <button key={item} disabled={targetLoading} className={item === horizon ? "active" : ""} onClick={() => void loadTargets(item)}>{item.toUpperCase()}</button>)}</nav></header>
    {targetError && <div><DataError message={targetError}/><button className="button-soft mt-3" onClick={() => void loadTargets(horizon)}><RefreshCw size={16}/>Riprova</button></div>}
    {!data && !targetLoading && <DataUnavailable title="Target non disponibili" detail="I provider non hanno restituito prezzo e storico sufficienti."/>}
    {data && <div className={targetLoading ? "grid gap-7 opacity-50" : "grid gap-7"}>
      <section className="grid-3">
        {([['Bear', data.bearTarget], ['Base', data.baseTarget], ['Bull', data.bullTarget]] as const).map(([label, value]) => <div className="soft-card p-7 text-center" key={label}><span className="small-label">{label} scenario</span><div className="kpi mt-3 text-black">{money(value, data.currency)}</div><p className="muted mt-2">{value === null ? "N/D" : formatPercent((value / data.currentPrice - 1) * 100, true)} vs current</p></div>)}
      </section>
      <section className="grid gap-6 lg:grid-cols-[1.1fr_0.9fr]">
        <div className="card p-6"><div className="section-row"><div><span className="small-label">Composite target</span><h2 className="mt-1 text-3xl font-bold">{money(data.compositeTarget, data.currency)}</h2></div><span className="badge bg-indigo-50 text-indigo-700">Confidence {data.confidence.toFixed(0)}%</span></div><div className="mt-6 grid-3"><div><small className="muted">Current</small><strong className="mt-1 block">{money(data.currentPrice, data.currency)}</strong></div><div><small className="muted">Upside / downside</small><strong className={`mt-1 block ${(data.upsideDownside ?? 0) >= 0 ? "positive" : "negative"}`}>{data.upsideDownside === null ? "N/D" : formatPercent(data.upsideDownside, true)}</strong></div><div><small className="muted">Horizon</small><strong className="mt-1 block">{data.horizon.toUpperCase()}</strong></div></div><p className="muted mt-6 text-sm">{data.methodology.join(" ")}</p></div>
        <div className="soft-card p-6"><h2 className="flex items-center gap-2 text-xl font-bold"><Target className="text-indigo-500"/>Analyst consensus</h2><dl className="mt-5 grid grid-cols-2 gap-3 text-sm"><dt>Low</dt><dd>{money(data.analystTarget.minimum, data.currency)}</dd><dt>Mean</dt><dd>{money(data.analystTarget.mean, data.currency)}</dd><dt>Median</dt><dd>{money(data.analystTarget.median, data.currency)}</dd><dt>High</dt><dd>{money(data.analystTarget.maximum, data.currency)}</dd><dt>Analysts</dt><dd>{data.analystTarget.analystCount ?? "N/D"}</dd><dt>Dispersion</dt><dd>{data.analystTarget.dispersion === null ? "N/D" : `${data.analystTarget.dispersion.toFixed(1)}%`}</dd><dt>Provider</dt><dd>{data.analystTarget.provider ?? "N/D"}</dd></dl></div>
      </section>
      <section className="grid-2">
        <div className="card p-6"><span className="small-label">Technical target</span><h2 className="mt-2 text-2xl font-bold">{money(data.technicalTarget.value, data.currency)}</h2><p className="muted mt-3">{data.technicalTarget.methods.join(" · ")}</p><div className="mt-5 grid grid-cols-3 gap-3 text-sm"><span>Bear<br/><strong>{money(data.technicalTarget.bear, data.currency)}</strong></span><span>Base<br/><strong>{money(data.technicalTarget.base, data.currency)}</strong></span><span>Bull<br/><strong>{money(data.technicalTarget.bull, data.currency)}</strong></span></div></div>
        <div className="card p-6"><span className="small-label">Fundamental target</span><h2 className="mt-2 text-2xl font-bold">{money(data.fundamentalTarget.value, data.currency)}</h2><p className="muted mt-3">{data.fundamentalTarget.methods.length ? data.fundamentalTarget.methods.join(" · ") : "Dati fondamentali insufficienti"}</p><div className="mt-5 grid grid-cols-3 gap-3 text-sm"><span>Bear<br/><strong>{money(data.fundamentalTarget.bear, data.currency)}</strong></span><span>Base<br/><strong>{money(data.fundamentalTarget.base, data.currency)}</strong></span><span>Bull<br/><strong>{money(data.fundamentalTarget.bull, data.currency)}</strong></span></div></div>
      </section>
      <section><div className="section-row"><div><span className="small-label">Discounted cash flow</span><h2 className="mt-1 text-xl font-bold">Transparent DCF</h2></div><span className={`badge ${data.dcf.applicable ? "badge-buy" : "badge-hold"}`}>{data.dcf.applicable ? "Applicable" : "Not applicable"}</span></div>{data.dcf.applicable ? <div className="grid-3">{data.dcf.scenarios.map((scenario) => <div className="soft-card p-5" key={scenario.name}><strong>{scenario.name}</strong><div className="mt-2 text-xl font-bold">{money(scenario.fairValuePerShare, data.currency)}</div><small className="muted">Growth {(scenario.explicitGrowth * 100).toFixed(1)}% · WACC {(scenario.discountRate * 100).toFixed(1)}%</small></div>)}</div> : <DataUnavailable title="DCF non applicabile" detail={data.dcf.warnings.join(" ")}/>}</section>
    </div>}
    <section>
      <div className="section-row"><div><span className="small-label">No-order calculator</span><h2 className="mt-1 text-xl font-bold">Risk planner</h2></div><ShieldAlert className="text-indigo-500"/></div>
      <div className="grid gap-6 lg:grid-cols-[0.85fr_1.15fr]">
        <div className="soft-card grid gap-4 p-6"><label>Side<select className="modal-input" value={side} onChange={(event) => setSide(event.target.value as TradeSide)}><option>LONG</option><option>SHORT</option></select></label><label>Entry price<input className="modal-input" type="number" min="0.0001" step="any" value={entry} onChange={(event) => setEntry(event.target.value)}/></label><label>Risk profile<select className="modal-input" value={profile} onChange={(event) => setProfile(event.target.value as RiskProfile)}>{["CONSERVATIVE","MODERATE","AGGRESSIVE","CUSTOM"].map((item) => <option key={item}>{item}</option>)}</select></label><label>Account size (optional)<input className="modal-input" type="number" min="1" value={account} onChange={(event) => setAccount(event.target.value)}/></label><label>Maximum risk %<input className="modal-input" type="number" min="0.1" max="10" step="0.1" value={riskPercent} onChange={(event) => setRiskPercent(event.target.value)}/></label><button className="button-primary" disabled={riskLoading || !Number(entry)} onClick={() => void calculateRisk()}><Calculator size={17}/>{riskLoading ? "Calculating…" : "Calculate risk plan"}</button>{riskError && <DataError message={riskError}/>}</div>
        {risk ? <div className="card p-6"><div className="grid-3"><div><span className="small-label">Suggested stop</span><div className="mt-2 text-xl font-bold negative">{money(risk.suggestedStop, data?.currency ?? "USD")}</div></div><div><span className="small-label">Target 2R</span><div className="mt-2 text-xl font-bold positive">{money(risk.target2, data?.currency ?? "USD")}</div></div><div><span className="small-label">Position size</span><div className="mt-2 text-xl font-bold">{risk.positionSize ?? "N/D"}</div></div></div><dl className="mt-7 grid grid-cols-2 gap-3 text-sm"><dt>Structural stop</dt><dd>{money(risk.structuralStop, data?.currency ?? "USD")}</dd><dt>ATR stop</dt><dd>{money(risk.atrStop, data?.currency ?? "USD")}</dd><dt>Percentage stop</dt><dd>{money(risk.percentageStop, data?.currency ?? "USD")}</dd><dt>Risk/share</dt><dd>{money(risk.riskPerShare, data?.currency ?? "USD")}</dd><dt>Risk/reward</dt><dd>{risk.riskRewardRatio?.toFixed(2) ?? "N/D"}</dd><dt>Chandelier exit</dt><dd>{money(risk.chandelierExit, data?.currency ?? "USD")}</dd></dl>{risk.volatilityWarning && <p className="mt-5 text-sm text-amber-700">{risk.volatilityWarning}</p>}<p className="muted mt-5 text-xs">{risk.disclaimer}</p></div> : <DataUnavailable title="Configure a risk plan" detail="Enter optional account data only if you want a bounded position-size estimate."/>}
      </div>
    </section>
  </div>;
}
