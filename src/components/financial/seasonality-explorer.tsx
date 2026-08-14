"use client";

import { CalendarDays, Download, LoaderCircle, PlayCircle, RefreshCw, TrendingUp } from "lucide-react";
import { useMemo, useState } from "react";
import { ProbabilityRing, SeasonalityCurvesChart, SeasonalityDirectionalChart } from "@/components/charts/seasonality-v2-charts";
import { SEASONALITY_HISTORICAL_WINDOWS, type SeasonalityAnalysis, type SeasonalityCurve, type SeasonalityHistoricalWindow, type SeasonalitySide } from "@/engines/seasonality";
import { formatPercent } from "@/lib";
import type { ApiSuccess } from "@/types";
import { DataError } from "./data-state";

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const tableRanges = [5, 10, 15, 20, 25, "ALL"] as const;
type DirectionalTab = "daily" | "weekly" | "monthly";

function pct(value: number | null, signed = true) {
  return value === null ? "Dato non disponibile" : formatPercent(value, signed);
}

function formatInputTimestamp(value: string) {
  return new Intl.DateTimeFormat("en-GB", { dateStyle: "medium", timeStyle: "short", timeZone: "UTC" }).format(new Date(value));
}

function initialSeries(analysis: SeasonalityAnalysis) {
  const available = analysis.curves.filter((curve) => curve.available);
  const preferred = new Set(["CURRENT", "5Y", "10Y", "20Y", "MAX"]);
  return new Set(available.filter((curve) => preferred.has(curve.id)).map((curve) => curve.id));
}

function allCurves(analysis: SeasonalityAnalysis): SeasonalityCurve[] {
  return [...analysis.curves, ...analysis.presidentialCycles.map((item) => item.curve), ...(analysis.bestCorrelatedYear.curve ? [analysis.bestCorrelatedYear.curve] : [])];
}

export function SeasonalityExplorer({ symbol, initial }: { symbol: string; initial: SeasonalityAnalysis }) {
  const [analysis, setAnalysis] = useState(initial);
  const [selectedWindows, setSelectedWindows] = useState<SeasonalityHistoricalWindow[]>(initial.windows);
  const [visibleIds, setVisibleIds] = useState(() => initialSeries(initial));
  const [selectedMonth, setSelectedMonth] = useState(initial.directional.selectedMonth);
  const [rangeStart, setRangeStart] = useState(initial.tradeRange?.rangeStart ?? "01-01");
  const [rangeEnd, setRangeEnd] = useState(initial.tradeRange?.rangeEnd ?? "12-31");
  const [side, setSide] = useState<SeasonalitySide>(initial.tradeRange?.side ?? "LONG");
  const [directionalTab, setDirectionalTab] = useState<DirectionalTab>("monthly");
  const [tableRange, setTableRange] = useState<(typeof tableRanges)[number]>(10);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const curves = useMemo(() => allCurves(analysis), [analysis]);
  const visibleCurves = curves.filter((curve) => visibleIds.has(curve.id));
  const primaryStats = analysis.tradeRange?.statistics.find((item) => item.seriesId === (selectedWindows.includes("20Y") ? "20Y" : selectedWindows.at(-1))) ?? analysis.tradeRange?.statistics.find((item) => item.status === "AVAILABLE") ?? null;
  const historicalMatrixRows = analysis.monthlyMatrix?.rows.filter((row) => !row.current).slice(0, tableRange === "ALL" ? undefined : tableRange) ?? [];
  const matrixRows = [...(analysis.monthlyMatrix?.rows.filter((row) => row.current) ?? []), ...historicalMatrixRows];
  const matrixSummary = Array.from({ length: 12 }, (_, index) => {
    const values = historicalMatrixRows.map((row) => row.cells[index]).filter((cell) => cell.status === "COMPLETE" && cell.returnPct !== null).map((cell) => cell.returnPct as number);
    return { month: index + 1, probability: values.length ? values.filter((value) => value > 0).length / values.length * 100 : null, averageReturn: values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : null };
  });

  async function refresh() {
    if (!selectedWindows.length) { setError("Seleziona almeno una finestra storica."); return; }
    setLoading(true); setError("");
    try {
      const params = new URLSearchParams({ symbol, windows: selectedWindows.join(","), month: String(selectedMonth), rangeStart, rangeEnd, side, includeCycles: "true", includeCorrelations: "true", includeTradeStats: "true", includeTable: "true" });
      const response = await fetch(`/api/analysis/seasonality?${params.toString()}`);
      const body = await response.json() as ApiSuccess<SeasonalityAnalysis> | { error?: { message?: string } };
      if (!response.ok || !("data" in body)) throw new Error("error" in body ? body.error?.message : "Seasonality unavailable");
      setAnalysis(body.data);
      const availableIds = new Set(allCurves(body.data).filter((curve) => curve.available).map((curve) => curve.id));
      setVisibleIds((current) => { const retained = new Set([...current].filter((id) => availableIds.has(id))); if (!retained.size) for (const id of initialSeries(body.data)) retained.add(id); return retained; });
    } catch (requestError) { setError(requestError instanceof Error ? requestError.message : "Seasonality temporarily unavailable."); }
    finally { setLoading(false); }
  }

  function toggleWindow(window: SeasonalityHistoricalWindow) {
    setSelectedWindows((current) => current.includes(window) ? current.filter((item) => item !== window) : SEASONALITY_HISTORICAL_WINDOWS.filter((item) => item === window || current.includes(item)));
  }

  function toggleSeries(id: string) {
    setVisibleIds((current) => { const next = new Set(current); if (next.has(id)) next.delete(id); else next.add(id); return next; });
  }

  function download() {
    const header = ["progress", ...visibleCurves.map((curve) => curve.id)].join(",");
    const rows = Array.from({ length: 1_000 }, (_, index) => [index / 999, ...visibleCurves.map((curve) => curve.points[index]?.value ?? "")].join(","));
    const url = URL.createObjectURL(new Blob([[header, ...rows].join("\n")], { type: "text/csv" }));
    const anchor = document.createElement("a"); anchor.href = url; anchor.download = `${symbol}-seasonality-v2.csv`; anchor.click(); URL.revokeObjectURL(url);
  }

  return <div className="container-shell page-stack">
    <header className="flex flex-wrap items-end justify-between gap-5"><div><span className="page-kicker">Historical research / {analysis.modelVersion}</span><h1 className="page-title">Seasonality intelligence</h1><p className="muted mt-3 max-w-3xl">Adjusted daily OHLC history, calendar-normalized patterns and no-look-ahead comparisons for {symbol}.</p></div><button className="button-soft" onClick={() => alert(analysis.disclaimer)}><PlayCircle size={17}/>Methodology</button></header>

    <section className="soft-card !p-5"><div className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
      <Meta label="Data source" value={`${analysis.provider} · ${analysis.source}`}/><Meta label="Coverage" value={`${analysis.availableHistory.firstDate} → ${analysis.availableHistory.lastDate}`}/><Meta label="Completed years" value={String(analysis.availableYears)}/><Meta label="Observations" value={analysis.observations.toLocaleString("en-US")}/><Meta label="Quality" value={analysis.quality}/>
    </div><p className="muted mt-4 text-xs">Current year is shown separately and excluded from historical averages. Last input: {formatInputTimestamp(analysis.dataTimestamp)} UTC · history {analysis.historyHash}.</p></section>

    <section>
      <div className="section-row"><span className="section-pill">Normalized seasonal curves</span><div className="flex gap-2"><button className="icon-button" onClick={download} aria-label="Download CSV"><Download size={18}/></button><button className="button-primary" onClick={refresh} disabled={loading}>{loading ? <LoaderCircle className="animate-spin" size={17}/> : <RefreshCw size={17}/>}Apply</button></div></div>
      <div className="mb-5"><span className="small-label mb-2 block">Historical windows</span><div className="segmented">{SEASONALITY_HISTORICAL_WINDOWS.map((window) => <button key={window} className={selectedWindows.includes(window) ? "active" : ""} onClick={() => toggleWindow(window)}>{window}</button>)}</div></div>
      {error && <div className="mb-5"><DataError message={error}/></div>}
      <div className="mb-5 flex flex-wrap gap-2">{curves.map((curve) => <button key={curve.id} disabled={!curve.available} onClick={() => toggleSeries(curve.id)} className={`badge border ${visibleIds.has(curve.id) ? "border-[var(--navy)] bg-[var(--navy)] text-white" : "border-[var(--border)] bg-white text-[var(--muted)]"}`} title={curve.available ? `${curve.sampleYears.length} completed years` : curve.status}>{curve.label}{!curve.available ? " · N/A" : ""}</button>)}</div>
      <div className={loading ? "opacity-50" : ""}><SeasonalityCurvesChart curves={visibleCurves}/></div>
    </section>

    <section className="grid-3">
      <Kpi label="Best analogue" value={analysis.bestCorrelatedYear.year?.toString() ?? "N/A"} detail={analysis.bestCorrelatedYear.correlation.correlationScore === null ? "Insufficient current sample" : `${analysis.bestCorrelatedYear.correlation.correlationScore.toFixed(1)} correlation score`}/>
      <Kpi label="Current seasonal bias" value={(analysis.currentYearMonthlyReturns[new Date(analysis.dataTimestamp).getUTCMonth() + 1] ?? 0) > 0 ? "Positive" : "Negative / neutral"} detail="Observed current-year data only"/>
      <Kpi label="Model integrity" value="No look-ahead" detail="Partial years never enter historical means"/>
    </section>

    <section>
      <div className="section-row"><span className="section-pill">Correlation & presidential cycle</span><TrendingUp className="text-[var(--accent-dark)]"/></div>
      <div className="grid gap-5 xl:grid-cols-2"><div className="table-shell"><table className="data-table !min-w-0"><thead><tr><th>Series</th><th>Raw r</th><th>Score</th><th>n</th></tr></thead><tbody>{analysis.correlations.map((item) => <tr key={item.seriesId}><td>{item.label}</td><td>{item.correlation.rawCorrelation?.toFixed(3) ?? "N/A"}</td><td>{item.correlation.correlationScore?.toFixed(1) ?? "N/A"}</td><td>{item.correlation.sampleSize}</td></tr>)}</tbody></table></div><div className="grid gap-3 sm:grid-cols-2">{analysis.presidentialCycles.map((item) => <div className="soft-card p-5" key={item.cycle}><span className="small-label">{item.label}</span><strong className="mt-2 block text-xl">{item.curve.available ? `${item.sampleYears.length} years` : "Insufficient history"}</strong><p className="muted mt-2 text-xs">{item.quality} quality · {item.curve.correlation?.correlationScore?.toFixed(1) ?? "N/A"} score</p></div>)}</div></div>
    </section>

    <section>
      <div className="section-row"><span className="section-pill">Date-range trade statistics</span><CalendarDays className="text-[var(--violet)]"/></div>
      <div className="mb-6 grid gap-4 md:grid-cols-2 xl:grid-cols-5"><Field label="From (MM-DD)" value={rangeStart} onChange={setRangeStart}/><Field label="To (MM-DD)" value={rangeEnd} onChange={setRangeEnd}/><label><span className="small-label mb-2 block">Direction</span><select className="h-11 w-full rounded-xl border border-[var(--border)] bg-white px-3" value={side} onChange={(event) => setSide(event.target.value as SeasonalitySide)}><option>LONG</option><option>SHORT</option></select></label><div className="xl:col-span-2 flex items-end"><button className="button-primary w-full" onClick={refresh} disabled={loading}>Recalculate range</button></div></div>
      {primaryStats ? <div className="grid gap-5 xl:grid-cols-[260px_1fr]"><div className="soft-card p-5"><ProbabilityRing value={primaryStats.probability} label={`${side} success · ${primaryStats.label}`}/><p className="muted mt-5 text-xs">n={primaryStats.observations} · {primaryStats.quality} quality</p></div><div className="grid-3"><Kpi label="Average / median" value={pct(primaryStats.averageReturn)} detail={`Median ${pct(primaryStats.medianReturn)}`}/><Kpi label="Best / worst" value={pct(primaryStats.bestReturn)} detail={`Worst ${pct(primaryStats.worstReturn)}`}/><Kpi label="Average max excursion" value={pct(primaryStats.avgMaxRise)} detail={`Average max drop ${pct(primaryStats.avgMaxDrop)}`}/></div></div> : <p className="muted">Trade statistics unavailable for this range.</p>}
      {primaryStats?.trades.length ? <div className="table-shell mt-6"><table className="data-table"><thead><tr><th>Year</th><th>Open</th><th>Close</th><th>Return</th><th>Max rise</th><th>Max drop</th><th>MFE</th><th>MAE</th></tr></thead><tbody>{primaryStats.trades.slice().reverse().map((trade) => <tr key={`${trade.year}-${trade.openDate}`}><td>{trade.year}</td><td>{trade.openDate}</td><td>{trade.closeDate}</td><td className={trade.returnPct >= 0 ? "positive" : "negative"}>{pct(trade.returnPct)}</td><td>{pct(trade.maxRisePct)}</td><td>{pct(trade.maxDropPct)}</td><td>{pct(trade.maxFavorableExcursionPct)}</td><td>{pct(trade.maxAdverseExcursionPct)}</td></tr>)}</tbody></table></div> : null}
    </section>

    <section>
      <div className="section-row"><span className="section-pill">Monthly return matrix</span><div className="segmented">{tableRanges.map((range) => <button key={range} className={tableRange === range ? "active" : ""} onClick={() => setTableRange(range)}>{range === "ALL" ? "All" : `${range}Y`}</button>)}</div></div>
      <div className="table-shell"><table className="data-table"><thead><tr><th>Year</th>{MONTHS.map((month) => <th key={month}>{month}</th>)}</tr></thead><tbody>{matrixRows.map((row) => <tr key={row.year}><td><strong>{row.year}</strong>{row.current ? <span className="ml-2 text-xs text-[var(--violet)]">YTD</span> : null}</td>{row.cells.map((cell) => <td key={cell.month} className={cell.returnPct === null ? "muted" : cell.returnPct >= 0 ? "positive" : "negative"}>{cell.returnPct === null ? "—" : pct(cell.returnPct)}{cell.status === "IN_PROGRESS" ? "*" : ""}</td>)}</tr>)}<tr className="bg-slate-50"><td><strong>Probability</strong></td>{matrixSummary.map((cell) => <td key={cell.month}>{cell.probability === null ? "—" : `${cell.probability.toFixed(0)}%`}</td>)}</tr><tr className="bg-slate-50"><td><strong>Average</strong></td>{matrixSummary.map((cell) => <td key={cell.month} className={cell.averageReturn === null ? "muted" : cell.averageReturn >= 0 ? "positive" : "negative"}>{pct(cell.averageReturn)}</td>)}</tr></tbody></table></div><p className="muted mt-3 text-xs">* Current incomplete month: visible, but excluded from the selected-range historical summaries.</p>
    </section>

    <section>
      <div className="section-row"><span className="section-pill">Directional seasonality score</span><div className="segmented">{(["daily", "weekly", "monthly"] as DirectionalTab[]).map((tab) => <button key={tab} className={directionalTab === tab ? "active" : ""} onClick={() => setDirectionalTab(tab)}>{tab[0].toUpperCase() + tab.slice(1)}</button>)}</div></div>
      <div className="mb-5 flex flex-wrap items-end gap-4"><label><span className="small-label mb-2 block">Selected month</span><select className="h-11 rounded-xl border border-[var(--border)] bg-white px-4" value={selectedMonth} onChange={(event) => setSelectedMonth(Number(event.target.value))}>{MONTHS.map((month, index) => <option key={month} value={index + 1}>{month}</option>)}</select></label><button className="button-secondary" onClick={refresh} disabled={loading}>Update directional analysis</button><p className="muted text-xs">Signed −100…+100 score combines historical hit rate and return consistency.</p></div>
      <SeasonalityDirectionalChart series={analysis.directional[directionalTab]}/>
    </section>

    <p className="muted px-2 text-xs leading-5">{analysis.disclaimer}</p>
  </div>;
}

function Meta({ label, value }: { label: string; value: string }) { return <div><span className="small-label">{label}</span><strong className="mt-1 block break-words text-sm">{value}</strong></div>; }
function Kpi({ label, value, detail }: { label: string; value: string; detail: string }) { return <div className="soft-card p-6"><span className="small-label">{label}</span><div className="kpi mt-3 text-[clamp(24px,3vw,35px)]">{value}</div><p className="muted mt-3 text-sm">{detail}</p></div>; }
function Field({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) { return <label><span className="small-label mb-2 block">{label}</span><input className="h-11 w-full rounded-xl border border-[var(--border)] bg-white px-3" value={value} maxLength={5} placeholder="MM-DD" onChange={(event) => onChange(event.target.value)}/></label>; }
