"use client";

import { useMemo } from "react";
import type { PatternAnalysis, PatternMatchedEvent } from "@/engines/pattern";
import { kairoChartTheme } from "./chart-theme";
import { adaptTimePoints, patternHorizonTime } from "./lightweight/chart-data-adapter";
import type { KairoChartSeriesDefinition } from "./lightweight/chart-types";
import { KairoTimeSeriesChart } from "./lightweight/kairo-time-series-chart";

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

const eventColors = [
  "rgba(139,156,246,.34)",
  "rgba(125,200,214,.34)",
  "rgba(179,147,232,.34)",
  "rgba(240,160,178,.34)",
  "rgba(121,188,165,.34)",
  "rgba(215,162,90,.34)",
];

function eventMetadata(event: PatternMatchedEvent) {
  const sign = event.performance >= 0 ? "+" : "";
  return `${event.matchEndDate} · ${event.direction.toLowerCase()} · similarity ${event.similarity.toFixed(1)}% · outcome ${sign}${(event.performance * 100).toFixed(2)}%`;
}

function patternPoints(rows: PatternChartRow[], key: keyof PatternChartRow | `event_${string}`, minimumHorizon: number, metadata?: string) {
  return adaptTimePoints(rows.map((row) => ({
    time: patternHorizonTime(row.horizon, minimumHorizon),
    label: row.date ?? (row.horizon > 0 ? `T+${row.horizon}` : row.horizon === 0 ? "Reference" : `T${row.horizon}`),
    value: typeof row[key] === "number" ? Number(row[key]) * 100 : null,
    metadata,
  }))).data;
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
  const values = rows.flatMap((row) => Object.entries(row).filter(([key, value]) => key !== "horizon" && key !== "label" && key !== "date" && typeof value === "number").map(([, value]) => Number(value)));
  const summary = values.length ? `Pattern analogue chart with ${analysis.matchedEvents.length} historical matches, from ${(Math.min(...values) * 100).toFixed(1)}% to ${(Math.max(...values) * 100).toFixed(1)}%.` : "Pattern analogue chart. Data unavailable.";
  const minimumHorizon = rows[0]?.horizon ?? 0;
  const chartSeries = useMemo<KairoChartSeriesDefinition[]>(() => {
    const definitions: KairoChartSeriesDefinition[] = [{
      id: "observed",
      label: "Observed path",
      type: "area",
      data: patternPoints(rows, "observed", minimumHorizon),
      color: kairoChartTheme.secondary,
      topColor: "rgba(82,103,232,.20)",
      bottomColor: "rgba(82,103,232,.02)",
      format: "percent",
      lineWidth: 3,
    }];
    if (showSingleEvents) {
      analysis.matchedEvents.filter((event) => event.rank !== 1 && event.id !== selectedEventId).forEach((event, index) => definitions.push({
        id: `event_${event.id}`,
        label: `Event #${event.rank}`,
        type: "line",
        data: patternPoints(rows, `event_${event.id}`, minimumHorizon, eventMetadata(event)),
        color: eventColors[index % eventColors.length],
        format: "percent",
        lineWidth: 1,
        lastValueVisible: false,
        showInLegend: false,
      }));
    }
    definitions.push(
      { id: "best", label: "Most correlated event", type: "line", data: patternPoints(rows, "best", minimumHorizon, analysis.mostCorrelated ? eventMetadata(analysis.mostCorrelated) : undefined), color: kairoChartTheme.bestMatch, format: "percent", lineWidth: 3 },
      { id: "average-long", label: "Average Long", type: "line", data: patternPoints(rows, "averageLong", minimumHorizon), color: kairoChartTheme.averageLong, format: "percent", lineWidth: 3 },
      { id: "average-short", label: "Average Short", type: "line", data: patternPoints(rows, "averageShort", minimumHorizon), color: kairoChartTheme.averageShort, format: "percent", lineWidth: 3, lineStyle: 2 },
    );
    if (selected && selected.rank !== 1) definitions.push({
      id: `selected_${selected.id}`,
      label: `Selected #${selected.rank}`,
      type: "line",
      data: patternPoints(rows, `event_${selected.id}`, minimumHorizon, eventMetadata(selected)),
      color: kairoChartTheme.selectedEvent,
      format: "percent",
      lineWidth: 3,
    });
    return definitions.filter((definition) => definition.data.length > 0);
  }, [analysis.matchedEvents, analysis.mostCorrelated, minimumHorizon, rows, selected, selectedEventId, showSingleEvents]);

  return <div className="pattern-chart-shell" data-testid="pattern-main-chart">
    <div className="mb-3 flex flex-wrap items-center gap-2 text-xs font-semibold">
      {showSingleEvents && <span className="muted">{analysis.matchedEvents.length} individual paths visible</span>}
      {selected && <span className="rounded-full bg-indigo-50 px-3 py-1 text-indigo-700">Selected #{selected.rank} · {selected.matchEndDate}</span>}
    </div>
    <KairoTimeSeriesChart
      ariaLabel={summary}
      chartKey={`pattern:${analysis.symbol}:${analysis.lookback}:${analysis.reference.resolvedDate}`}
      height={500}
      referenceTime={patternHorizonTime(0, minimumHorizon)}
      referenceLabel="Reference"
      series={chartSeries}
    />
  </div>;
}
