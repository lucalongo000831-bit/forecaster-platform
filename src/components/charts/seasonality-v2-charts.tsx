"use client";

import { CartesianGrid, Line, LineChart, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import type { SeasonalityCurve, SeasonalityDirectionalSeries } from "@/engines/seasonality";

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const COLORS = ["#40d7a5", "#6576ed", "#e95f75", "#f2b84b", "#20a4a8", "#9c5dd5", "#dc6a2e", "#168665", "#c94150", "#31405a", "#8b96a8", "#087e61", "#b15c93", "#2f72c4"];
const axis = { fontSize: 11, fill: "#738096" };

function colorFor(id: string, index: number) {
  if (id === "CURRENT") return "#e95f75";
  if (id.startsWith("YEAR_")) return "#172033";
  return COLORS[index % COLORS.length];
}

export function SeasonalityCurvesChart({ curves }: { curves: SeasonalityCurve[] }) {
  const available = curves.filter((curve) => curve.available && curve.points.length);
  const rows = Array.from({ length: 1_000 }, (_, index) => {
    const row: Record<string, number | string | undefined> = { progress: index / 999 };
    for (const curve of available) row[curve.id] = curve.points[index]?.value;
    return row;
  });
  if (!available.length) return <div className="grid min-h-72 place-items-center rounded-2xl border border-dashed border-[var(--border)] text-sm text-[var(--muted)]">Historical curves unavailable for the selected windows.</div>;
  return <div className="chart-wrap chart-tall" role="img" aria-label={`Seasonality V2 chart with ${available.length} real-data series`}>
    <ResponsiveContainer width="100%" height="100%"><LineChart data={rows} margin={{ top: 16, right: 18, bottom: 8, left: 2 }}>
      <CartesianGrid stroke="#e2e7ef" strokeDasharray="2 2"/>
      <XAxis dataKey="progress" type="number" domain={[0, 1]} ticks={Array.from({ length: 12 }, (_, index) => index / 12)} tickFormatter={(value) => MONTHS[Math.min(11, Math.floor(Number(value) * 12))]} tick={axis}/>
      <YAxis tick={axis} tickFormatter={(value) => `${Number(value).toFixed(0)}%`} width={48}/>
      <Tooltip labelFormatter={(value) => MONTHS[Math.min(11, Math.floor(Number(value) * 12))]} formatter={(value, name) => [`${Number(value).toFixed(2)}%`, available.find((curve) => curve.id === name)?.label ?? String(name)]}/>
      <ReferenceLine y={0} stroke="#9aa5b7" strokeDasharray="4 4"/>
      {available.map((curve, index) => <Line key={curve.id} type="monotone" dataKey={curve.id} name={curve.id} stroke={colorFor(curve.id, index)} strokeWidth={curve.id === "CURRENT" ? 3.2 : 2} strokeDasharray={curve.type === "PRESIDENTIAL_CYCLE" ? "6 4" : undefined} dot={false} connectNulls={false} isAnimationActive={false}/>) }
    </LineChart></ResponsiveContainer>
  </div>;
}

export function SeasonalityDirectionalChart({ series }: { series: SeasonalityDirectionalSeries[] }) {
  const available = series.filter((item) => item.status === "AVAILABLE");
  const keys = available[0]?.buckets.map((bucket) => bucket.key) ?? [];
  const rows = keys.map((key, index) => {
    const row: Record<string, string | number | null> = { label: available[0]?.buckets[index]?.label ?? String(key) };
    for (const item of available) row[item.seriesId] = item.buckets[index]?.score ?? null;
    return row;
  });
  if (!rows.length) return <div className="grid min-h-64 place-items-center text-sm text-[var(--muted)]">Directional score unavailable.</div>;
  return <div className="chart-wrap chart-short" role="img" aria-label="Signed historical directional scores">
    <ResponsiveContainer width="100%" height="100%"><LineChart data={rows} margin={{ top: 12, right: 16, bottom: 8, left: 0 }}>
      <CartesianGrid stroke="#e2e7ef" strokeDasharray="2 2"/><XAxis dataKey="label" tick={axis} minTickGap={18}/><YAxis domain={[-100, 100]} tick={axis} width={44}/>
      <Tooltip formatter={(value, name) => [value === null ? "N/A" : Number(value).toFixed(1), available.find((item) => item.seriesId === name)?.label ?? String(name)]}/>
      <ReferenceLine y={0} stroke="#172033"/>
      {available.map((item, index) => <Line key={item.seriesId} dataKey={item.seriesId} stroke={colorFor(item.seriesId, index)} strokeWidth={2.3} dot={false} connectNulls={false} isAnimationActive={false}/>) }
    </LineChart></ResponsiveContainer>
  </div>;
}

export function ProbabilityRing({ value, label }: { value: number | null; label: string }) {
  const safe = value === null ? 0 : Math.max(0, Math.min(100, value));
  return <div className="flex items-center gap-4"><div className="grid size-24 place-items-center rounded-full" style={{ background: `conic-gradient(var(--accent) ${safe}%, #e8edf3 0)` }}><div className="grid size-17 place-items-center rounded-full bg-white text-lg font-extrabold">{value === null ? "N/A" : `${value.toFixed(0)}%`}</div></div><div><span className="small-label">Probability</span><strong className="mt-1 block">{label}</strong></div></div>;
}
