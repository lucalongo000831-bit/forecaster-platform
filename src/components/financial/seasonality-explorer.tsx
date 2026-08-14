"use client";

import {
  CalendarDays,
  Download,
  HelpCircle,
  LoaderCircle,
  RefreshCw,
  Settings2,
  TrendingUp,
  X,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import {
  ProbabilityRing,
  SeasonalityCurvesChart,
  SeasonalityDirectionalChart,
  seasonalityColorFor,
} from "@/components/charts/seasonality-v2-charts";
import {
  SEASONALITY_HISTORICAL_WINDOWS,
  type SeasonalityAnalysis,
  type SeasonalityCurve,
  type SeasonalityHistoricalWindow,
  type SeasonalityRangeStats,
  type SeasonalitySide,
} from "@/engines/seasonality";
import { formatPercent } from "@/lib";
import type { ApiSuccess } from "@/types";
import { DataError } from "./data-state";

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const tableRanges = [5, 10, 15, 20, 25, "ALL"] as const;
type TableRange = (typeof tableRanges)[number];
type RequestSettings = { windows: SeasonalityHistoricalWindow[]; month: number; rangeStart: string; rangeEnd: string; side: SeasonalitySide };

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

function saveCsv(filename: string, rows: string[][]) {
  const encode = (value: string) => `"${value.replaceAll('"', '""')}"`;
  const url = URL.createObjectURL(new Blob([rows.map((row) => row.map(encode).join(",")).join("\n")], { type: "text/csv;charset=utf-8" }));
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}

function curveGroupLabel(type: SeasonalityCurve["type"]) {
  if (type === "HISTORICAL_WINDOW" || type === "CURRENT") return "Averages";
  if (type === "PRESIDENTIAL_CYCLE") return "Presidential cycles";
  return "Best analogue";
}

function dateValue(mmdd: string) {
  return /^\d{2}-\d{2}$/.test(mmdd) ? `2024-${mmdd}` : "";
}

function selectedRangeStats(statistics: SeasonalityRangeStats[], selectedId: string) {
  return statistics.find((item) => item.seriesId === selectedId && item.status === "AVAILABLE") ?? statistics.find((item) => item.status === "AVAILABLE") ?? null;
}

export function SeasonalityExplorer({ symbol, initial }: { symbol: string; initial: SeasonalityAnalysis }) {
  const [analysis, setAnalysis] = useState(initial);
  const [selectedWindows, setSelectedWindows] = useState<SeasonalityHistoricalWindow[]>(initial.windows);
  const [visibleIds, setVisibleIds] = useState(() => initialSeries(initial));
  const [selectedMonth, setSelectedMonth] = useState(initial.directional.selectedMonth);
  const [rangeStart, setRangeStart] = useState(initial.tradeRange?.rangeStart ?? "01-01");
  const [rangeEnd, setRangeEnd] = useState(initial.tradeRange?.rangeEnd ?? "12-31");
  const [side, setSide] = useState<SeasonalitySide>(initial.tradeRange?.side ?? "LONG");
  const [tableRange, setTableRange] = useState<TableRange>(10);
  const [selectedStatsId, setSelectedStatsId] = useState(() => initial.tradeRange?.statistics.find((item) => item.seriesId === "20Y" && item.status === "AVAILABLE")?.seriesId ?? initial.tradeRange?.statistics.find((item) => item.status === "AVAILABLE")?.seriesId ?? "");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const curves = useMemo(() => allCurves(analysis), [analysis]);
  const availableCurves = curves.filter((curve) => curve.available);
  const visibleCurves = availableCurves.filter((curve) => visibleIds.has(curve.id));
  const statistics = analysis.tradeRange?.statistics ?? [];
  const activeStats = selectedRangeStats(statistics, selectedStatsId);
  const historicalMatrixRows = analysis.monthlyMatrix?.rows.filter((row) => !row.current).slice(0, tableRange === "ALL" ? undefined : tableRange) ?? [];
  const matrixRows = [...(analysis.monthlyMatrix?.rows.filter((row) => row.current) ?? []), ...historicalMatrixRows];
  const matrixSummary = Array.from({ length: 12 }, (_, index) => {
    const values = historicalMatrixRows.map((row) => row.cells[index]).filter((cell) => cell.status === "COMPLETE" && cell.returnPct !== null).map((cell) => cell.returnPct as number);
    return { month: index + 1, probability: values.length ? values.filter((value) => value > 0).length / values.length * 100 : null, averageReturn: values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : null, observations: values.length };
  });
  const directionalVisibleIds = new Set([...visibleIds].filter((id) => id !== "CURRENT"));

  useEffect(() => {
    let cancelled = false;
    const stored = sessionStorage.getItem(`kairo-seasonality-series:${symbol}`);
    if (!stored) return;
    try {
      const ids = JSON.parse(stored) as string[];
      const allowed = new Set(availableCurves.map((curve) => curve.id));
      const next = new Set(ids.filter((id) => allowed.has(id)));
      if (next.size) queueMicrotask(() => { if (!cancelled) setVisibleIds(next); });
    } catch { /* Ignore corrupt per-session preferences. */ }
    return () => { cancelled = true; };
  // availableCurves is derived from the current response and intentionally read once per symbol.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [symbol]);

  useEffect(() => {
    sessionStorage.setItem(`kairo-seasonality-series:${symbol}`, JSON.stringify([...visibleIds]));
  }, [symbol, visibleIds]);

  async function refresh(overrides: Partial<RequestSettings> = {}) {
    const settings: RequestSettings = {
      windows: overrides.windows ?? selectedWindows,
      month: overrides.month ?? selectedMonth,
      rangeStart: overrides.rangeStart ?? rangeStart,
      rangeEnd: overrides.rangeEnd ?? rangeEnd,
      side: overrides.side ?? side,
    };
    if (!settings.windows.length) { setError("Select at least one historical window."); return; }
    setLoading(true);
    setError("");
    try {
      const params = new URLSearchParams({ symbol, windows: settings.windows.join(","), month: String(settings.month), rangeStart: settings.rangeStart, rangeEnd: settings.rangeEnd, side: settings.side, includeCycles: "true", includeCorrelations: "true", includeTradeStats: "true", includeTable: "true" });
      const response = await fetch(`/api/analysis/seasonality?${params.toString()}`);
      const body = await response.json() as ApiSuccess<SeasonalityAnalysis> | { error?: { message?: string } };
      if (!response.ok || !("data" in body)) throw new Error("error" in body ? body.error?.message : "Seasonality unavailable");
      setAnalysis(body.data);
      const availableIds = new Set(allCurves(body.data).filter((curve) => curve.available).map((curve) => curve.id));
      setVisibleIds((current) => {
        const retained = new Set([...current].filter((id) => availableIds.has(id)));
        if (!retained.size) for (const id of initialSeries(body.data)) retained.add(id);
        return retained;
      });
      if (!body.data.tradeRange?.statistics.some((item) => item.seriesId === selectedStatsId && item.status === "AVAILABLE")) {
        setSelectedStatsId(body.data.tradeRange?.statistics.find((item) => item.status === "AVAILABLE")?.seriesId ?? "");
      }
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Seasonality temporarily unavailable.");
    } finally {
      setLoading(false);
    }
  }

  function toggleWindow(window: SeasonalityHistoricalWindow) {
    setSelectedWindows((current) => current.includes(window) ? current.filter((item) => item !== window) : SEASONALITY_HISTORICAL_WINDOWS.filter((item) => item === window || current.includes(item)));
  }

  function toggleSeries(id: string) {
    setVisibleIds((current) => { const next = new Set(current); if (next.has(id)) next.delete(id); else next.add(id); return next; });
  }

  function updateChartRange(start: string, end: string) {
    setRangeStart(start);
    setRangeEnd(end);
    void refresh({ rangeStart: start, rangeEnd: end });
  }

  function clearRange() {
    setRangeStart("01-01");
    setRangeEnd("12-31");
    void refresh({ rangeStart: "01-01", rangeEnd: "12-31" });
  }

  function changeSide(next: SeasonalitySide) {
    setSide(next);
    void refresh({ side: next });
  }

  function downloadCurves() {
    const rows = [["calendar_progress", "calendar_date", ...availableCurves.map((curve) => curve.label)]];
    for (let index = 0; index < 1_000; index += 1) rows.push([(index / 999).toFixed(6), availableCurves[0]?.points[index]?.label ?? "", ...availableCurves.map((curve) => curve.points[index]?.value?.toFixed(6) ?? "")]);
    saveCsv(`${symbol}-seasonality-curves.csv`, rows);
  }

  function downloadMatrix() {
    const rows = [["year", ...MONTHS], ...matrixRows.map((row) => [String(row.year), ...row.cells.map((cell) => cell.returnPct?.toFixed(6) ?? "")]), ["positive_probability", ...matrixSummary.map((cell) => cell.probability?.toFixed(2) ?? "")], ["average_return", ...matrixSummary.map((cell) => cell.averageReturn?.toFixed(6) ?? "")]];
    saveCsv(`${symbol}-monthly-seasonality-${tableRange}.csv`, rows);
  }

  return <div className="container-shell page-stack" aria-busy={loading}>
    <header className="flex flex-wrap items-end justify-between gap-5">
      <div><span className="page-kicker">Historical research / {analysis.modelVersion}</span><h1 className="page-title">Seasonality intelligence</h1><p className="muted mt-3 max-w-3xl">Calendar-normalized market behavior for {symbol}, built only from adjusted daily OHLC history and completed samples.</p></div>
      <MethodologyHelp disclaimer={analysis.disclaimer}/>
    </header>

    <section className="soft-card !p-5"><div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
      <Meta label="Data source" value={`${analysis.provider} · ${analysis.source}`}/><Meta label="Coverage" value={`${analysis.availableHistory.firstDate} → ${analysis.availableHistory.lastDate}`}/><Meta label="Completed years" value={String(analysis.availableYears)}/><Meta label="Observations" value={analysis.observations.toLocaleString("en-US")}/><Meta label="Quality" value={analysis.quality}/>
    </div><p className="muted mt-4 text-xs">Current year remains separate from every historical average. Last validated input: {formatInputTimestamp(analysis.dataTimestamp)} UTC · history {analysis.historyHash}.</p></section>

    <section aria-labelledby="seasonality-charts-title">
      <SectionHeading id="seasonality-charts-title" title="Seasonality charts" help="Each curve is normalized to 1,000 calendar-progress points. Current-year observations stop at TODAY; incomplete years never enter averages.">
        <button className="icon-button" onClick={downloadCurves} aria-label="Download all available seasonality curves as CSV"><Download size={18}/></button>
        <button className="button-primary" onClick={() => void refresh()} disabled={loading}>{loading ? <LoaderCircle className="animate-spin" size={17}/> : <RefreshCw size={17}/>}Apply</button>
      </SectionHeading>
      <div className="mb-4"><span className="small-label mb-2 block">Historical windows</span><div className="segmented max-w-full overflow-x-auto">{SEASONALITY_HISTORICAL_WINDOWS.map((window) => { const required = window === "MAX" ? 2 : Number.parseInt(window); const available = analysis.availableYears >= required; return <button key={window} disabled={!available} className={selectedWindows.includes(window) ? "active" : ""} onClick={() => toggleWindow(window)} title={available ? `${analysis.availableYears} completed years available` : `Requires ${required} completed years; ${analysis.availableYears} available`}>{window}</button>; })}</div></div>
      {error && <div className="mb-5"><DataError message={error}/></div>}
      <SeriesMenu curves={curves} visibleIds={visibleIds} onToggle={toggleSeries}/>
      <SeriesLegend curves={visibleCurves}/>
      <div className={`relative mt-3 overflow-hidden rounded-2xl border border-[var(--border)] bg-white p-2 sm:p-4 ${loading ? "opacity-60" : ""}`}>
        {loading ? <div className="pointer-events-none absolute inset-x-5 top-6 z-10 h-3 animate-pulse rounded-full bg-slate-100"/> : null}
        <SeasonalityCurvesChart curves={visibleCurves} rangeStart={rangeStart} rangeEnd={rangeEnd} onRangeChange={updateChartRange}/>
      </div>
      <RangeControls rangeStart={rangeStart} rangeEnd={rangeEnd} side={side} loading={loading} crossesYear={analysis.tradeRange?.crossesYear ?? false} onStart={setRangeStart} onEnd={setRangeEnd} onSide={changeSide} onApply={() => void refresh()} onClear={clearRange}/>
    </section>

    <section aria-labelledby="correlation-title">
      <SectionHeading id="correlation-title" title="Correlation" help="Pearson correlation is calculated only over the observed current-year segment. The 0–100 score expresses positive similarity; negative correlations are clipped to zero. It is descriptive, not predictive."><TrendingUp className="text-[var(--accent-dark)]"/></SectionHeading>
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {analysis.correlations.filter((item) => analysis.curves.some((curve) => curve.id === item.seriesId && curve.type === "HISTORICAL_WINDOW")).map((item) => <CorrelationCard key={item.seriesId} label={item.label} raw={item.correlation.rawCorrelation} score={item.correlation.correlationScore} sample={item.correlation.sampleSize} quality={item.correlation.quality}/>) }
        {analysis.presidentialCycles.map((item) => <CorrelationCard key={item.cycle} label={item.label} raw={item.curve.correlation?.rawCorrelation ?? null} score={item.curve.correlation?.correlationScore ?? null} sample={item.curve.correlation?.sampleSize ?? 0} quality={item.quality}/>) }
        <CorrelationCard label={analysis.bestCorrelatedYear.year ? `Best year · ${analysis.bestCorrelatedYear.year}` : "Best year"} raw={analysis.bestCorrelatedYear.correlation.rawCorrelation} score={analysis.bestCorrelatedYear.correlation.correlationScore} sample={analysis.bestCorrelatedYear.correlation.sampleSize} quality={analysis.bestCorrelatedYear.correlation.quality}/>
      </div>
    </section>

    <section aria-labelledby="trade-stats-title">
      <SectionHeading id="trade-stats-title" title="Trade stats" help="For every completed historical sample, Kairo enters at the first valid session on or after the start date and exits at the last valid session on or before the end date. SHORT reverses return and excursion direction."><CalendarDays className="text-[var(--violet)]"/></SectionHeading>
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
        {statistics.map((item, index) => <button key={item.seriesId} disabled={item.status !== "AVAILABLE"} onClick={() => setSelectedStatsId(item.seriesId)} className={`soft-card p-5 text-left transition ${selectedStatsId === item.seriesId ? "ring-2 ring-[var(--accent)]" : "hover:-translate-y-0.5"}`} title={item.status === "AVAILABLE" ? `${item.observations} completed observations` : item.status}>
          <ProbabilityRing value={item.probability} label={`${side} · ${item.label}`} color={seasonalityColorFor(item.seriesId, index)}/>
          <div className="mt-4 grid grid-cols-2 gap-2 border-t border-slate-100 pt-3 text-xs"><Metric label="Mean" value={pct(item.averageReturn)}/><Metric label="Median" value={pct(item.medianReturn)}/><Metric label="Best" value={pct(item.bestReturn)}/><Metric label="Worst" value={pct(item.worstReturn)}/></div>
          <p className="muted mt-3 text-[11px]">n={item.observations} · {item.quality} quality · {item.dataCompleteness.toFixed(0)}% coverage</p>
        </button>)}
      </div>
    </section>

    <section aria-labelledby="trade-table-title">
      <SectionHeading id="trade-table-title" title="Historical trade table" help="The selected distribution is expanded below, newest observation first. MFE and MAE are direction-aware maximum favorable and adverse excursions."/>
      {activeStats ? <><div className="grid-3 mb-5"><Kpi label="Average / median" value={pct(activeStats.averageReturn)} detail={`Median ${pct(activeStats.medianReturn)}`}/><Kpi label="Best / worst" value={pct(activeStats.bestReturn)} detail={`Worst ${pct(activeStats.worstReturn)}`}/><Kpi label="Average excursion" value={pct(activeStats.avgMaxRise)} detail={`Average max drop ${pct(activeStats.avgMaxDrop)}`}/></div><div className="table-shell"><table className="data-table"><thead><tr><th>Year</th><th>Open</th><th>Close</th><th>Return</th><th>Max rise</th><th>Max drop</th><th>MFE</th><th>MAE</th></tr></thead><tbody>{activeStats.trades.slice().sort((a, b) => b.year - a.year).map((trade) => <tr key={`${trade.year}-${trade.openDate}`}><td>{trade.year}</td><td>{trade.openDate}</td><td>{trade.closeDate}</td><td className={trade.returnPct >= 0 ? "positive" : "negative"}>{pct(trade.returnPct)}</td><td>{pct(trade.maxRisePct)}</td><td>{pct(trade.maxDropPct)}</td><td>{pct(trade.maxFavorableExcursionPct)}</td><td>{pct(trade.maxAdverseExcursionPct)}</td></tr>)}</tbody></table></div></> : <EmptyPanel message="Trade statistics are unavailable for this range."/>}
    </section>

    <section aria-labelledby="matrix-title">
      <SectionHeading id="matrix-title" title="Monthly matrix" help="Every cell uses the first adjusted open and final adjusted close of a completed calendar month. Current partial months are marked; future months remain blank and never enter summaries.">
        <button className="icon-button" onClick={downloadMatrix} aria-label="Download monthly matrix as CSV"><Download size={18}/></button>
      </SectionHeading>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3"><div className="segmented">{tableRanges.map((range) => <button key={range} className={tableRange === range ? "active" : ""} onClick={() => setTableRange(range)}>{range === "ALL" ? "All" : `${range}Y`}</button>)}</div><p className="muted text-xs">Summary uses {historicalMatrixRows.length} completed years</p></div>
      <div className="table-shell"><table className="data-table"><thead><tr><th>Year</th>{MONTHS.map((month) => <th key={month}>{month}</th>)}</tr></thead><tbody>{matrixRows.map((row) => <tr key={row.year}><td><strong>{row.year}</strong>{row.current ? <span className="ml-2 text-xs text-[var(--violet)]">YTD</span> : null}</td>{row.cells.map((cell) => <td key={cell.month} className={cell.returnPct === null ? "muted" : cell.returnPct >= 0 ? "positive" : "negative"}>{cell.returnPct === null ? "—" : pct(cell.returnPct)}{cell.status === "IN_PROGRESS" ? "*" : ""}</td>)}</tr>)}<tr className="bg-slate-50"><td><strong>Probability</strong></td>{matrixSummary.map((cell) => <td key={cell.month} title={`n=${cell.observations}`}>{cell.probability === null ? "—" : <span className={cell.probability >= 50 ? "positive" : "negative"}>{cell.probability >= 50 ? "↗" : "↘"} {cell.probability.toFixed(0)}%</span>}</td>)}</tr><tr className="bg-slate-50"><td><strong>Average</strong></td>{matrixSummary.map((cell) => <td key={cell.month} className={cell.averageReturn === null ? "muted" : cell.averageReturn >= 0 ? "positive" : "negative"}>{pct(cell.averageReturn)}</td>)}</tr></tbody></table></div><p className="muted mt-3 text-xs">* Incomplete current month: visible for context, excluded from every historical summary.</p>
    </section>

    <DirectionalSection id="daily-title" title="Daily" help="Day-of-month bars use the selected calendar month and show the signed positive-hit-rate score. Missing days remain absent rather than interpolated." series={analysis.directional.daily} visibleIds={directionalVisibleIds} month={selectedMonth} onMonth={setSelectedMonth} onApply={() => void refresh()} loading={loading}/>
    <DirectionalSection id="weekly-title" title="Weekly" help={analysis.assetClass === "CRYPTO" ? "Crypto uses all seven UTC weekdays." : "Equities and ETFs use valid Monday–Friday exchange sessions only."} series={analysis.directional.weekly} visibleIds={directionalVisibleIds}/>
    <DirectionalSection id="monthly-title" title="Monthly" help="Monthly bars compare complete calendar-month returns across every selected historical series, presidential cycle and best analogue." series={analysis.directional.monthly} visibleIds={directionalVisibleIds}/>

    <footer className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-[var(--border)] bg-white px-5 py-4 text-xs text-[var(--muted)]">
      <span>Source: {analysis.provider} / {analysis.source}</span><span>Through {analysis.availableHistory.lastDate}</span><span>{analysis.modelVersion} · {analysis.quality} quality · descriptive research</span>
    </footer>
  </div>;
}

export function SeriesMenu({ curves, visibleIds, onToggle }: { curves: SeasonalityCurve[]; visibleIds: Set<string>; onToggle: (id: string) => void }) {
  const groups = ["Averages", "Presidential cycles", "Best analogue"];
  return <details className="group rounded-2xl border border-[var(--border)] bg-white p-4" open>
    <summary className="flex cursor-pointer list-none items-center justify-between gap-4"><span className="flex items-center gap-2 font-bold"><Settings2 size={17}/>Chart series</span><span className="muted text-xs">{visibleIds.size} selected</span></summary>
    <div className="mt-4 grid gap-4 border-t border-slate-100 pt-4 lg:grid-cols-2 xl:grid-cols-[1.7fr_1fr_1fr]">{groups.map((group) => <div key={group}><span className="small-label mb-2 block">{group}</span><div className="flex flex-wrap gap-2">{curves.filter((curve) => curveGroupLabel(curve.type) === group).map((curve, index) => <button type="button" key={curve.id} disabled={!curve.available} aria-pressed={visibleIds.has(curve.id)} onClick={() => onToggle(curve.id)} className={`badge border transition ${visibleIds.has(curve.id) ? "border-[var(--navy)] bg-[var(--navy)] text-white" : "border-[var(--border)] bg-white text-[var(--muted)]"}`} title={curve.available ? `${curve.sampleYears.length} completed years · ${curve.quality} quality` : `${curve.status} · ${curve.sampleYears.length} completed years available`}><span className="mr-1 inline-block size-2 rounded-full" style={{ background: seasonalityColorFor(curve.id, index) }}/>{curve.label}{!curve.available ? " · N/A" : ""}</button>)}</div></div>)}</div>
  </details>;
}

function SeriesLegend({ curves }: { curves: SeasonalityCurve[] }) {
  return <div className="mt-4 flex flex-wrap gap-x-5 gap-y-2" aria-label="Visible chart legend">{curves.map((curve, index) => <span className="flex items-center gap-2 text-xs font-semibold" key={curve.id}><span className="h-0.5 w-6 rounded" style={{ background: seasonalityColorFor(curve.id, index) }}/>{curve.label}<span className="font-normal text-[var(--muted)]">n={curve.sampleYears.length}</span></span>)}</div>;
}

export function RangeControls({ rangeStart, rangeEnd, side, loading, crossesYear, onStart, onEnd, onSide, onApply, onClear }: { rangeStart: string; rangeEnd: string; side: SeasonalitySide; loading: boolean; crossesYear: boolean; onStart: (value: string) => void; onEnd: (value: string) => void; onSide: (value: SeasonalitySide) => void; onApply: () => void; onClear: () => void }) {
  return <div className="mt-4 grid gap-4 rounded-2xl border border-[var(--border)] bg-white p-4 sm:grid-cols-2 xl:grid-cols-[1fr_1fr_auto_auto]">
    <DateField label="Start date" value={rangeStart} onChange={onStart}/><DateField label="End date" value={rangeEnd} onChange={onEnd}/>
    <div><span className="small-label mb-2 block">Position</span><div className="segmented"><button className={side === "LONG" ? "active" : ""} onClick={() => onSide("LONG")}>Long</button><button className={side === "SHORT" ? "active" : ""} onClick={() => onSide("SHORT")}>Short</button></div></div>
    <div className="flex flex-wrap items-end gap-2"><button className="button-secondary" onClick={onApply} disabled={loading}>Recalculate</button><button className="icon-button" onClick={onClear} aria-label="Clear selected date range"><X size={17}/></button></div>
    <p className="muted sm:col-span-2 xl:col-span-4 text-xs">Drag directly on the chart or use the calendars. {crossesYear ? "This range crosses the calendar year." : "The highlighted range stays within one calendar year."}</p>
  </div>;
}

function DateField({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) {
  return <label><span className="small-label mb-2 block">{label}</span><input type="date" min="2024-01-01" max="2024-12-31" className="h-11 w-full rounded-xl border border-[var(--border)] bg-white px-3" value={dateValue(value)} onChange={(event) => onChange(event.target.value.slice(5))}/></label>;
}

function CorrelationCard({ label, raw, score, sample, quality }: { label: string; raw: number | null; score: number | null; sample: number; quality: string }) {
  const safe = score === null ? 0 : Math.max(0, Math.min(100, score));
  return <div className="soft-card p-5"><div className="flex items-start justify-between gap-3"><div><span className="small-label">Current-year fit</span><strong className="mt-1 block">{label}</strong></div><span className="badge">{quality}</span></div><div className="mt-5 h-2 overflow-hidden rounded-full bg-slate-200"><div className="h-full rounded-full bg-gradient-to-r from-[var(--violet)] to-[var(--accent)]" style={{ width: `${safe}%` }}/></div><div className="mt-3 flex justify-between text-sm"><strong>{score?.toFixed(1) ?? "N/A"}</strong><span className="muted">r {raw?.toFixed(3) ?? "—"} · n={sample}</span></div></div>;
}

function DirectionalSection({ id, title, help, series, visibleIds, month, onMonth, onApply, loading = false }: { id: string; title: string; help: string; series: SeasonalityAnalysis["directional"]["daily"]; visibleIds: Set<string>; month?: number; onMonth?: (value: number) => void; onApply?: () => void; loading?: boolean }) {
  return <section aria-labelledby={id}><SectionHeading id={id} title={title} help={help}><span className="badge">−100 → +100</span></SectionHeading>
    {month && onMonth ? <div className="mb-5 flex flex-wrap items-end gap-3"><label><span className="small-label mb-2 block">Calendar month</span><select aria-label="Calendar month" className="h-11 rounded-xl border border-[var(--border)] bg-white px-4" value={month} onChange={(event) => onMonth(Number(event.target.value))}>{MONTHS.map((label, index) => <option key={label} value={index + 1}>{label}</option>)}</select></label><button className="button-secondary" onClick={onApply} disabled={loading}>Update daily view</button></div> : null}
    <div className="rounded-2xl border border-[var(--border)] bg-white p-2 sm:p-4"><SeasonalityDirectionalChart series={series} visibleIds={visibleIds}/></div>
  </section>;
}

function MethodologyHelp({ disclaimer }: { disclaimer: string }) {
  return <details className="relative"><summary className="button-soft cursor-pointer list-none"><HelpCircle size={17}/>Methodology</summary><div className="absolute right-0 z-20 mt-2 w-[min(88vw,420px)] rounded-2xl border border-[var(--border)] bg-white p-5 text-sm leading-6 shadow-xl"><strong>Seasonality V2 methodology</strong><p className="muted mt-2">{disclaimer}</p></div></details>;
}

function SectionHeading({ id, title, help, children }: { id: string; title: string; help: string; children?: React.ReactNode }) {
  return <div className="section-row"><div className="flex min-w-0 items-center gap-2"><h2 id={id} className="section-pill">{title}</h2><details className="relative"><summary className="grid size-8 cursor-pointer list-none place-items-center rounded-full text-[var(--muted)] hover:bg-slate-100" aria-label={`About ${title}`}><HelpCircle size={16}/></summary><p className="absolute left-0 z-20 mt-2 w-[min(80vw,360px)] rounded-xl border border-[var(--border)] bg-white p-4 text-xs leading-5 text-[var(--muted)] shadow-xl">{help}</p></details></div>{children ? <div className="flex flex-wrap items-center gap-2">{children}</div> : null}</div>;
}

function EmptyPanel({ message }: { message: string }) { return <div className="grid min-h-40 place-items-center rounded-2xl border border-dashed border-[var(--border)] px-5 text-center text-sm text-[var(--muted)]">{message}</div>; }
function Meta({ label, value }: { label: string; value: string }) { return <div><span className="small-label">{label}</span><strong className="mt-1 block break-words text-sm">{value}</strong></div>; }
function Metric({ label, value }: { label: string; value: string }) { return <div><span className="muted block">{label}</span><strong className="mt-0.5 block">{value}</strong></div>; }
function Kpi({ label, value, detail }: { label: string; value: string; detail: string }) { return <div className="soft-card p-6"><span className="small-label">{label}</span><div className="kpi mt-3 text-[clamp(24px,3vw,35px)]">{value}</div><p className="muted mt-3 text-sm">{detail}</p></div>; }
