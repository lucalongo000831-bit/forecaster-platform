"use client";

import { useState } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Line,
  LineChart,
  ReferenceArea,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
  type TooltipContentProps,
} from "recharts";
import type { SeasonalityCurve, SeasonalityDirectionalSeries } from "@/engines/seasonality";

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const COLORS = ["#6576ed", "#e95f75", "#f2b84b", "#20a4a8", "#9c5dd5", "#dc6a2e", "#168665", "#c94150", "#31405a", "#8b96a8", "#087e61", "#b15c93", "#2f72c4"];
const SERIES_COLORS: Record<string, string> = {
  CURRENT: "#e95f75", "1Y": "#6576ed", "3Y": "#e95f75", "5Y": "#6576ed", "7Y": "#20a4a8", "10Y": "#c94150", "15Y": "#dc6a2e", "20Y": "#f2b84b", "25Y": "#9c5dd5", MAX: "#168665",
  CYCLE_POST_ELECTION: "#40d7a5", CYCLE_MIDTERM: "#6576ed", CYCLE_PRE_ELECTION: "#e95f75", CYCLE_ELECTION: "#f2b84b",
};
const axis = { fontSize: 11, fill: "#738096" };
const REFERENCE_YEAR = 2024;
const DAY_MS = 86_400_000;

export function seasonalityColorFor(id: string, index = 0) {
  if (SERIES_COLORS[id]) return SERIES_COLORS[id];
  if (id.startsWith("YEAR_")) return "#172033";
  const deterministicIndex = [...id].reduce((sum, character) => sum + character.charCodeAt(0), index) % COLORS.length;
  return COLORS[deterministicIndex];
}

export function mmddToProgress(value: string) {
  if (!/^\d{2}-\d{2}$/.test(value)) return null;
  const date = new Date(`${REFERENCE_YEAR}-${value}T00:00:00Z`);
  if (Number.isNaN(date.getTime()) || date.toISOString().slice(5, 10) !== value) return null;
  return (date.getTime() - Date.UTC(REFERENCE_YEAR, 0, 1)) / (366 * DAY_MS - DAY_MS);
}

export function progressToMmdd(value: number) {
  const progress = Math.max(0, Math.min(1, value));
  return new Date(Date.UTC(REFERENCE_YEAR, 0, 1) + Math.round(progress * 365) * DAY_MS).toISOString().slice(5, 10);
}

function progressLabel(value: string | number) {
  const progress = Number(value);
  if (!Number.isFinite(progress)) return String(value);
  const date = new Date(Date.UTC(REFERENCE_YEAR, 0, 1) + Math.round(progress * 365) * DAY_MS);
  return new Intl.DateTimeFormat("en-GB", { day: "2-digit", month: "short", timeZone: "UTC" }).format(date);
}

function RangeAreas({ start, end }: { start: number; end: number }) {
  const common = { fill: "#40d7a5", fillOpacity: 0.09, stroke: "#18a97f", strokeOpacity: 0.34 };
  if (end >= start) return <ReferenceArea x1={start} x2={end} {...common}/>;
  return <><ReferenceArea x1={start} x2={1} {...common}/><ReferenceArea x1={0} x2={end} {...common}/></>;
}

export function SeasonalityCurvesChart({ curves, rangeStart, rangeEnd, onRangeChange }: {
  curves: SeasonalityCurve[];
  rangeStart: string;
  rangeEnd: string;
  onRangeChange?: (start: string, end: string) => void;
}) {
  const [dragStart, setDragStart] = useState<number | null>(null);
  const [dragEnd, setDragEnd] = useState<number | null>(null);
  const available = curves.filter((curve) => curve.available && curve.points.length);
  const rows = Array.from({ length: 1_000 }, (_, index) => {
    const row: Record<string, number | string | undefined> = { progress: index / 999 };
    for (const curve of available) row[curve.id] = curve.points[index]?.value;
    return row;
  });
  const current = available.find((curve) => curve.id === "CURRENT");
  const today = current?.points.at(-1)?.progress ?? null;
  const selectedStart = dragStart ?? mmddToProgress(rangeStart);
  const selectedEnd = dragEnd ?? mmddToProgress(rangeEnd);

  if (!available.length) return <div className="grid min-h-72 place-items-center rounded-2xl border border-dashed border-[var(--border)] px-5 text-center text-sm text-[var(--muted)]">Historical curves are unavailable for the selected windows.</div>;
  return <div className="chart-wrap chart-tall select-none" role="img" aria-label={`Seasonality V2 chart with ${available.length} real-data series. Drag across the chart to select a trade range.`}>
    <ResponsiveContainer width="100%" height="100%"><LineChart data={rows} margin={{ top: 22, right: 20, bottom: 8, left: 2 }}
      onMouseDown={(state) => { const value = Number(state.activeLabel); if (Number.isFinite(value)) { setDragStart(value); setDragEnd(value); } }}
      onMouseMove={(state) => { const value = Number(state.activeLabel); if (dragStart !== null && Number.isFinite(value)) setDragEnd(value); }}
      onMouseUp={() => { if (dragStart !== null && dragEnd !== null && onRangeChange) onRangeChange(progressToMmdd(dragStart), progressToMmdd(dragEnd)); setDragStart(null); setDragEnd(null); }}>
      <CartesianGrid stroke="#e2e7ef" strokeDasharray="2 2"/>
      <XAxis dataKey="progress" type="number" domain={[0, 1]} ticks={Array.from({ length: 12 }, (_, index) => index / 12)} tickFormatter={(value) => MONTHS[Math.min(11, Math.floor(Number(value) * 12))]} tick={axis}/>
      <YAxis tick={axis} tickFormatter={(value) => `${Number(value).toFixed(0)}%`} width={48}/>
      <Tooltip labelFormatter={(value) => progressLabel(typeof value === "string" || typeof value === "number" ? value : "")} formatter={(value, name) => {
        const curve = available.find((item) => item.id === name);
        return [`${Number(value).toFixed(2)}%`, `${curve?.label ?? String(name)} · n=${curve?.sampleYears.length ?? 0} · ${curve?.quality ?? "N/A"}`];
      }}/>
      <ReferenceLine y={0} stroke="#9aa5b7" strokeDasharray="4 4"/>
      {selectedStart !== null && selectedEnd !== null && !(rangeStart === "01-01" && rangeEnd === "12-31" && dragStart === null) ? <RangeAreas start={selectedStart} end={selectedEnd}/> : null}
      {today !== null ? <ReferenceLine x={today} stroke="#e95f75" strokeWidth={1.5} strokeDasharray="4 3" label={{ value: "TODAY", position: "insideTopRight", fill: "#c94150", fontSize: 10, fontWeight: 800 }}/> : null}
      {available.map((curve, index) => <Line key={curve.id} type="monotone" dataKey={curve.id} name={curve.id} stroke={seasonalityColorFor(curve.id, index)} strokeWidth={curve.id === "CURRENT" ? 3.2 : 2} strokeDasharray={curve.type === "PRESIDENTIAL_CYCLE" ? "6 4" : undefined} dot={false} connectNulls={false} isAnimationActive={false}/>) }
    </LineChart></ResponsiveContainer>
  </div>;
}

function DirectionalTooltip({ active, payload, label, series }: TooltipContentProps & { series: SeasonalityDirectionalSeries[] }) {
  if (!active || !payload?.length) return null;
  return <div className="max-w-72 rounded-xl border border-[var(--border)] bg-white p-3 text-xs shadow-xl">
    <strong className="mb-2 block text-sm">{label}</strong>
    <div className="space-y-2">{payload.map((entry) => {
      const item = series.find((candidate) => candidate.seriesId === String(entry.dataKey));
      const bucket = item?.buckets.find((candidate) => candidate.label === label);
      return <div key={String(entry.dataKey)} className="border-t border-slate-100 pt-2 first:border-0 first:pt-0">
        <div className="flex items-center justify-between gap-5"><span>{item?.label}</span><strong>{Number(entry.value).toFixed(1)}</strong></div>
        <p className="mt-1 text-[var(--muted)]">Hit rate {bucket?.positiveHitRate?.toFixed(0) ?? "—"}% · avg {bucket?.meanReturn?.toFixed(2) ?? "—"}% · n={bucket?.sampleSize ?? 0} · {bucket?.quality ?? "N/A"}</p>
      </div>;
    })}</div>
  </div>;
}

export function SeasonalityDirectionalChart({ series, visibleIds }: { series: SeasonalityDirectionalSeries[]; visibleIds?: Set<string> }) {
  const available = series.filter((item) => item.status === "AVAILABLE" && (!visibleIds || visibleIds.has(item.seriesId)));
  const keys = available[0]?.buckets.map((bucket) => bucket.key) ?? [];
  const rows = keys.map((key, index) => {
    const row: Record<string, string | number | null> = { label: available[0]?.buckets[index]?.label ?? String(key) };
    for (const item of available) row[item.seriesId] = item.buckets[index]?.score ?? null;
    return row;
  });
  if (!rows.length) return <div className="grid min-h-64 place-items-center rounded-2xl border border-dashed border-[var(--border)] px-5 text-center text-sm text-[var(--muted)]">Directional score is unavailable for the selected series.</div>;
  return <div className="chart-wrap chart-short" role="img" aria-label="Grouped bars showing signed historical directional scores from minus 100 to plus 100">
    <ResponsiveContainer width="100%" height="100%"><BarChart data={rows} margin={{ top: 12, right: 16, bottom: 8, left: 0 }} barGap={1}>
      <CartesianGrid stroke="#e2e7ef" strokeDasharray="2 2"/><XAxis dataKey="label" tick={axis} minTickGap={12}/><YAxis domain={[-100, 100]} tick={axis} width={44}/>
      <Tooltip content={(props) => <DirectionalTooltip {...props} series={available}/>}/>
      <ReferenceLine y={0} stroke="#172033"/>
      {available.map((item, index) => <Bar key={item.seriesId} dataKey={item.seriesId} name={item.label} fill={seasonalityColorFor(item.seriesId, index)} radius={[3, 3, 0, 0]} maxBarSize={18} isAnimationActive={false}/>) }
    </BarChart></ResponsiveContainer>
  </div>;
}

export function ProbabilityRing({ value, label, color = "var(--accent)" }: { value: number | null; label: string; color?: string }) {
  const safe = value === null ? 0 : Math.max(0, Math.min(100, value));
  return <div className="flex items-center gap-4"><div className="grid size-24 shrink-0 place-items-center rounded-full" style={{ background: `conic-gradient(${color} ${safe}%, #e8edf3 0)` }}><div className="grid size-17 place-items-center rounded-full bg-white text-lg font-extrabold">{value === null ? "N/A" : `${value.toFixed(0)}%`}</div></div><div><span className="small-label">Probability</span><strong className="mt-1 block">{label}</strong></div></div>;
}
