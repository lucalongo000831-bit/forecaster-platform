"use client";

import { useMemo } from "react";
import {
  Area,
  CartesianGrid,
  ComposedChart,
  Line,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
  type TooltipContentProps,
} from "recharts";
import type { PatternAnalysis, PatternMatchedEvent } from "@/engines/pattern";
import type { NameType, ValueType } from "recharts/types/component/DefaultTooltipContent";

type PatternChartRow = {
  horizon: number;
  label: string;
  date: string | null;
  observed?: number;
  best?: number;
  averageLong?: number;
  averageShort?: number;
  selected?: number;
  [key: `event_${string}`]: number | undefined;
};

const eventColors = ["#8b9cf6", "#7dc8d6", "#b393e8", "#f0a0b2", "#79bca5", "#d7a25a"];

function pct(value: number) {
  return `${value >= 0 ? "+" : ""}${(value * 100).toFixed(2)}%`;
}

function quality(similarity: number) {
  if (similarity >= 80) return "High";
  if (similarity >= 65) return "Medium";
  return "Low";
}

function PatternTooltip({ active, payload, label, events }: TooltipContentProps<ValueType, NameType> & { events: Map<string, PatternMatchedEvent> }) {
  if (!active || !payload?.length) return null;
  const row = payload[0]?.payload as PatternChartRow | undefined;
  const visible = payload.filter((entry) => typeof entry.value === "number").slice(0, 7);
  return <div className="max-w-80 rounded-2xl border border-slate-200 bg-white/95 p-4 text-xs shadow-xl backdrop-blur">
    <div className="mb-3 flex items-center justify-between gap-4">
      <strong>{row?.date ?? (Number(label) > 0 ? `Forward T+${label}` : `Reference ${label}`)}</strong>
      <span className="muted">{Number(label) > 0 ? `T+${label}` : Number(label) === 0 ? "T0" : `T${label}`}</span>
    </div>
    <div className="grid gap-2">
      {visible.map((entry) => {
        const key = String(entry.dataKey ?? "");
        const event = key.startsWith("event_") ? events.get(key.slice(6)) : key === "best" ? [...events.values()].find((item) => item.rank === 1) : key === "selected" ? [...events.values()].find((item) => `event_${item.id}` === entry.name) : undefined;
        return <div className="border-t border-slate-100 pt-2" key={`${key}-${entry.name}`}>
          <div className="flex justify-between gap-4"><span style={{ color: entry.color }}>{String(entry.name)}</span><strong>{pct(Number(entry.value))}</strong></div>
          {event && <div className="muted mt-1">{event.matchEndDate} · {event.direction.toLowerCase()} · similarity {event.similarity.toFixed(1)}% · outcome {pct(event.performance)} · {quality(event.similarity)} quality</div>}
        </div>;
      })}
    </div>
  </div>;
}

export function buildPatternChartRows(analysis: PatternAnalysis): PatternChartRow[] {
  const historicalOffset = Math.max(0, analysis.historicalObservedPath.length - 1);
  const rows = new Map<number, PatternChartRow>();
  const ensure = (horizon: number, date: string | null = null) => {
    const current = rows.get(horizon);
    if (current) {
      if (!current.date && date) current.date = date;
      return current;
    }
    const next: PatternChartRow = { horizon, label: horizon > 0 ? `+${horizon}` : String(horizon), date };
    rows.set(horizon, next);
    return next;
  };

  for (const point of analysis.historicalObservedPath) {
    ensure(point.observation - historicalOffset, point.date).observed = point.value;
  }
  for (const point of analysis.mostCorrelated?.normalizedFuturePath ?? []) ensure(point.observation, point.date).best = point.value;
  for (const point of analysis.averageLong?.points ?? []) ensure(point.observation, point.date).averageLong = point.value;
  for (const point of analysis.averageShort?.points ?? []) ensure(point.observation, point.date).averageShort = point.value;
  for (const event of analysis.matchedEvents) {
    for (const point of event.normalizedFuturePath) ensure(point.observation, point.date)[`event_${event.id}`] = point.value;
  }
  return [...rows.values()].sort((left, right) => left.horizon - right.horizon);
}

export function PatternV2Chart({ analysis, showSingleEvents, selectedEventId }: { analysis: PatternAnalysis; showSingleEvents: boolean; selectedEventId: string | null }) {
  const rows = useMemo(() => buildPatternChartRows(analysis), [analysis]);
  const eventMap = useMemo(() => new Map(analysis.matchedEvents.map((event) => [event.id, event])), [analysis.matchedEvents]);
  const selected = selectedEventId ? eventMap.get(selectedEventId) : null;
  const selectedKey = selected && selected.rank !== 1 ? `event_${selected.id}` : null;
  const values = rows.flatMap((row) => Object.entries(row).filter(([key, value]) => key !== "horizon" && key !== "label" && key !== "date" && typeof value === "number").map(([, value]) => Number(value)));
  const summary = values.length ? `Pattern analogue chart with ${analysis.matchedEvents.length} historical matches, from ${(Math.min(...values) * 100).toFixed(1)}% to ${(Math.max(...values) * 100).toFixed(1)}%.` : "Pattern analogue chart. Data unavailable.";

  return <div className="pattern-chart-shell" role="img" aria-label={summary} data-testid="pattern-main-chart">
    <div className="mb-4 flex flex-wrap items-center gap-x-5 gap-y-2 text-xs font-semibold">
      <span><i className="mr-2 inline-block h-0.5 w-6 bg-[#273a5b] align-middle"/>Observed path</span>
      <span><i className="mr-2 inline-block h-0.5 w-6 bg-[#626ee8] align-middle"/>Most correlated event</span>
      <span><i className="mr-2 inline-block h-0.5 w-6 bg-[#18a879] align-middle"/>Average Long</span>
      <span><i className="mr-2 inline-block h-0.5 w-6 bg-[#e05e72] align-middle"/>Average Short</span>
      {showSingleEvents && <span className="muted">{analysis.matchedEvents.length} individual paths visible</span>}
      {selected && <span className="rounded-full bg-indigo-50 px-3 py-1 text-indigo-700">Selected #{selected.rank} · {selected.matchEndDate}</span>}
    </div>
    <div className="h-[430px] min-h-[320px] w-full sm:h-[500px]">
      <ResponsiveContainer width="100%" height="100%">
        <ComposedChart data={rows} margin={{ top: 16, right: 18, bottom: 8, left: 4 }}>
          <defs>
            <linearGradient id="patternObservedFill" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#6576ed" stopOpacity={.28}/><stop offset="100%" stopColor="#6576ed" stopOpacity={.025}/></linearGradient>
          </defs>
          <CartesianGrid stroke="#e5eaf1" strokeDasharray="2 3" vertical={false}/>
          <XAxis dataKey="horizon" tick={{ fontSize: 11, fill: "#75829a" }} tickFormatter={(value) => Number(value) === 0 ? "REF" : Number(value) > 0 ? `+${value}` : String(value)} minTickGap={28}/>
          <YAxis tick={{ fontSize: 11, fill: "#75829a" }} tickFormatter={(value) => `${(Number(value) * 100).toFixed(0)}%`} width={48} domain={["auto", "auto"]}/>
          <Tooltip content={(props) => <PatternTooltip {...props} events={eventMap}/>}/>
          <ReferenceLine x={0} stroke="#172033" strokeDasharray="5 4" strokeWidth={1.5} label={{ value: "Reference", position: "insideTopRight", fill: "#526078", fontSize: 11 }}/>
          <Area type="monotone" dataKey="observed" stroke="#273a5b" fill="url(#patternObservedFill)" strokeWidth={2.5} connectNulls={false} name="Observed path" isAnimationActive={false}/>
          {showSingleEvents && analysis.matchedEvents.filter((event) => event.rank !== 1 && event.id !== selectedEventId).map((event, index) => <Line key={event.id} type="monotone" dataKey={`event_${event.id}`} stroke={eventColors[index % eventColors.length]} strokeOpacity={.28} strokeWidth={1} dot={false} isAnimationActive={false} name={`Event #${event.rank}`}/>) }
          <Line type="monotone" dataKey="best" stroke="#626ee8" strokeWidth={3.25} dot={false} connectNulls isAnimationActive={false} name="Most correlated event"/>
          <Line type="monotone" dataKey="averageLong" stroke="#18a879" strokeWidth={2.75} dot={false} connectNulls isAnimationActive={false} name="Average Long"/>
          <Line type="monotone" dataKey="averageShort" stroke="#e05e72" strokeWidth={2.75} dot={false} connectNulls isAnimationActive={false} name="Average Short"/>
          {selectedKey && <Line type="monotone" dataKey={selectedKey} stroke="#f4a525" strokeWidth={3} dot={false} connectNulls isAnimationActive={false} name={`Selected #${selected?.rank}`}/>}
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  </div>;
}
