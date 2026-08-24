"use client";

import { useState } from "react";
import { CartesianGrid, Line, LineChart, ReferenceArea, ReferenceDot, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import type { GlobalRiskHistoryPoint } from "@/engines/global-risk";
import { kairoChartTheme, kairoRechartsTheme } from "./chart-theme";

const ranges = ["1D", "5D", "1M", "3M", "6M", "1Y", "MAX"] as const;
type Envelope = { data?: GlobalRiskHistoryPoint[]; error?: { message?: string } };

export function GlobalRiskHistoryChart({ initialData }: { initialData: GlobalRiskHistoryPoint[] }) {
  const [data, setData] = useState(initialData); const [range, setRange] = useState<(typeof ranges)[number]>("1M"); const [loading, setLoading] = useState(false);
  async function changeRange(next: (typeof ranges)[number]) { setRange(next); setLoading(true); try { const response = await fetch(`/api/global-risk/history?range=${next}`); const body = await response.json() as Envelope; if (response.ok && body.data) setData(body.data); } finally { setLoading(false); } }
  const chart = data.map((point) => ({ ...point, label: new Intl.DateTimeFormat("en-GB", { day: "2-digit", month: "short", hour: range === "1D" ? "2-digit" : undefined, minute: range === "1D" ? "2-digit" : undefined }).format(new Date(point.calculatedAt)) }));
  return <div><div className="gr-range-tabs" aria-label="Historical range">{ranges.map((item) => <button key={item} className={range === item ? "active" : ""} onClick={() => void changeRange(item)} disabled={loading}>{item}</button>)}</div><div className="gr-history-chart" role="img" aria-label={`Global stress score history, ${chart.length} observations`}><ResponsiveContainer width="100%" height="100%"><LineChart data={chart} margin={{ top: 14, right: 18, bottom: 8, left: 0 }}><ReferenceArea y1={0} y2={24} fill="var(--risk-green-soft)" fillOpacity={1}/><ReferenceArea y1={25} y2={49} fill="var(--risk-yellow-soft)" fillOpacity={1}/><ReferenceArea y1={50} y2={74} fill="var(--risk-orange-soft)" fillOpacity={1}/><ReferenceArea y1={75} y2={100} fill="var(--risk-red-soft)" fillOpacity={1}/><CartesianGrid stroke={kairoRechartsTheme.grid} strokeDasharray="2 3"/><XAxis dataKey="label" tick={{ ...kairoRechartsTheme.axis, fontSize: 10 }} minTickGap={45}/><YAxis domain={[0, 100]} ticks={[0, 25, 50, 75, 100]} width={34} tick={{ ...kairoRechartsTheme.axis, fontSize: 10 }}/><Tooltip contentStyle={kairoRechartsTheme.tooltip}/><Line dataKey="score" stroke={kairoChartTheme.textPrimary} strokeWidth={3} dot={false} name="Global stress"/>{chart.filter((point) => point.statusChanged).map((point) => <ReferenceDot key={point.id} x={point.label} y={point.score} r={5} fill="var(--risk-orange)" stroke="#fff" label={{ value: point.status, position: "top", fontSize: 9 }}/>)}</LineChart></ResponsiveContainer></div></div>;
}
