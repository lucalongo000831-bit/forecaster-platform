"use client";

import { useMemo } from "react";
import type { TimePoint } from "@/types";
import { kairoChartTheme } from "../chart-theme";
import { adaptLegacyTimePoints, adaptTimePoints, adaptVolumePoints } from "./chart-data-adapter";
import type { KairoChartSeriesDefinition } from "./chart-types";
import { KairoTimeSeriesChart } from "./kairo-time-series-chart";

function definition(id: string, label: string, data: ReturnType<typeof adaptTimePoints>["data"], color: string, type: KairoChartSeriesDefinition["type"] = "line", format: KairoChartSeriesDefinition["format"] = "number"): KairoChartSeriesDefinition {
  return { id, label, data, color, type, format, lineWidth: id === "price" || id === "strategy" ? 3 : 2 };
}

export function MainPriceChart({ data, referenceValue, compact = false, currency }: { data: TimePoint[]; referenceValue?: number; compact?: boolean; currency?: string }) {
  const prepared = useMemo(() => {
    const primary = adaptLegacyTimePoints(data);
    const comparison = adaptLegacyTimePoints(data, "comparison");
    const volume = adaptVolumePoints(data, kairoChartTheme.volume);
    return {
      series: [
        definition("price", "Price", primary.data, kairoChartTheme.primary, "area", "price"),
        ...(comparison.data.length ? [definition("comparison", "Comparison", comparison.data, kairoChartTheme.comparison, "line", "price")] : []),
      ],
      volume: volume.data.length ? definition("volume", "Volume", volume.data, kairoChartTheme.volume, "histogram", "volume") : undefined,
    };
  }, [data]);
  const key = `${data[0]?.label ?? "empty"}:${data.at(-1)?.label ?? "empty"}:${data.length}`;
  return <KairoTimeSeriesChart ariaLabel="Interactive financial price chart" chartKey={`price:${key}`} compact={compact} currency={currency} height={compact ? 220 : 390} series={prepared.series} volume={prepared.volume} horizontalLines={referenceValue === undefined ? [] : [{ value: referenceValue, color: kairoChartTheme.referenceLine, title: "Last" }]}/>;
}

export function DrawdownChart({ data }: { data: TimePoint[] }) {
  const points = useMemo(() => adaptLegacyTimePoints(data).data, [data]);
  return <KairoTimeSeriesChart ariaLabel="Drawdown chart below the zero baseline" chartKey={`drawdown:${data[0]?.label}:${data.at(-1)?.label}:${data.length}`} height={250} series={[definition("drawdown", "Drawdown", points, kairoChartTheme.bearish, "baseline", "percent")]} horizontalLines={[{ value: 0, color: kairoChartTheme.axis, title: "0%" }]}/>;
}

export function BacktestEquityChart({ equity, benchmark }: { equity: Array<{ timestamp: string; value: number }>; benchmark: Array<{ timestamp: string; value: number }> }) {
  const series = useMemo(() => [
    definition("strategy", "Strategy", adaptTimePoints(equity.map((point) => ({ timestamp: point.timestamp, value: point.value }))).data, kairoChartTheme.primary, "line", "price"),
    definition("benchmark", "Benchmark", adaptTimePoints(benchmark.map((point) => ({ timestamp: point.timestamp, value: point.value }))).data, kairoChartTheme.benchmark, "line", "price"),
  ], [benchmark, equity]);
  return <KairoTimeSeriesChart ariaLabel="Backtest equity curve comparing strategy and benchmark" chartKey={`backtest:${equity[0]?.timestamp}:${equity.at(-1)?.timestamp}:${equity.length}`} height={430} series={series}/>;
}

export function DividendChart({ data }: { data: TimePoint[] }) {
  const points = useMemo(() => adaptLegacyTimePoints(data).data, [data]);
  return <KairoTimeSeriesChart ariaLabel="Dividend history" chartKey={`dividend:${data[0]?.label}:${data.at(-1)?.label}:${data.length}`} height={250} series={[definition("dividend", "Dividend", points, kairoChartTheme.bullish, "histogram", "price")]}/>;
}

export function PatternChart({ data, referenceValue }: { data: TimePoint[]; referenceValue: number }) {
  const series = useMemo(() => [
    definition("best", "Most correlated event", adaptLegacyTimePoints(data).data, kairoChartTheme.bestMatch, "area", "percent"),
    definition("average-long", "Average long", adaptLegacyTimePoints(data, "comparison").data, kairoChartTheme.averageLong, "line", "percent"),
  ], [data]);
  return <KairoTimeSeriesChart ariaLabel="Historical analogue pattern chart" chartKey={`legacy-pattern:${data[0]?.label}:${data.at(-1)?.label}:${data.length}`} height={430} series={series} horizontalLines={[{ value: referenceValue, color: kairoChartTheme.referenceLine, title: "Reference" }]}/>;
}

export function AdvancedDpoChart({ data }: { data: TimePoint[] }) {
  const prepared = useMemo(() => ({
    series: [
      definition("dpo", "DPO", adaptLegacyTimePoints(data).data, kairoChartTheme.primary, "line"),
      definition("dpo-slow", "Slow DPO", adaptLegacyTimePoints(data, "comparison").data, kairoChartTheme.comparison, "line"),
    ],
    volume: definition("volume", "Volume", adaptVolumePoints(data, kairoChartTheme.volume).data, kairoChartTheme.volume, "histogram", "volume"),
  }), [data]);
  return <KairoTimeSeriesChart ariaLabel="Detrended price oscillator with volume" chartKey={`dpo:${data[0]?.label}:${data.at(-1)?.label}:${data.length}`} height={430} series={prepared.series.filter((item) => item.data.length)} volume={prepared.volume.data.length ? prepared.volume : undefined} horizontalLines={[{ value: 0, color: kairoChartTheme.axis, title: "Zero" }]}/>;
}

export function OscillatorChart({ data }: { data: TimePoint[] }) {
  const points = useMemo(() => adaptLegacyTimePoints(data).data, [data]);
  return <KairoTimeSeriesChart ariaLabel="Momentum oscillator with threshold levels" chartKey={`oscillator:${data[0]?.label}:${data.at(-1)?.label}:${data.length}`} height={360} series={[definition("oscillator", "Momentum", points, kairoChartTheme.secondary, "line")]} horizontalLines={[
    { value: 100, color: kairoChartTheme.bearish, title: "+100" }, { value: 50, color: "#f29b6d" }, { value: 0, color: kairoChartTheme.axis, title: "Zero" }, { value: -50, color: "#67bfa4" }, { value: -100, color: kairoChartTheme.bullish, title: "-100" },
  ]}/>;
}

export function SharesChart({ data }: { data: TimePoint[] }) {
  const points = useMemo(() => adaptLegacyTimePoints(data).data, [data]);
  return <KairoTimeSeriesChart ariaLabel="Shares outstanding history" chartKey={`shares:${data[0]?.label}:${data.at(-1)?.label}:${data.length}`} height={250} series={[definition("shares", "Shares outstanding", points, "#0b7bb5", "area", "volume")]}/>;
}
