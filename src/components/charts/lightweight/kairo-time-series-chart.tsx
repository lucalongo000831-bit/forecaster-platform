"use client";

import { useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import type {
  IChartApi,
  ISeriesApi,
  ISeriesMarkersPluginApi,
  IPriceLine,
  MouseEventHandler,
  SeriesType,
  Time,
} from "lightweight-charts";
import { kairoChartTheme } from "../chart-theme";
import { formatKairoChartValue } from "./chart-formatters";
import { timeKey } from "./chart-data-adapter";
import type { KairoChartSeriesDefinition, KairoHorizontalLine } from "./chart-types";

type LightweightModule = typeof import("lightweight-charts");
type AnySeries = ISeriesApi<SeriesType>;
type SeriesRecord = {
  api: AnySeries;
  type: KairoChartSeriesDefinition["type"];
  definition: KairoChartSeriesDefinition;
  markers?: ISeriesMarkersPluginApi<Time>;
  priceLines?: IPriceLine[];
};

type TooltipState = {
  x: number;
  y: number;
  time: string;
  entries: Array<{ id: string; label: string; color: string; value: string; metadata?: string }>;
} | null;

function seriesOptions(definition: KairoChartSeriesDefinition) {
  const maximum = Math.max(0, ...definition.data.map((point) => Math.abs(point.value)));
  const precision = maximum >= 10 ? 2 : maximum >= 1 ? 3 : maximum >= 0.01 ? 4 : 6;
  const common = {
    visible: definition.visible !== false,
    lastValueVisible: definition.lastValueVisible ?? true,
    priceLineVisible: definition.priceLineVisible ?? false,
    lineWidth: definition.lineWidth ?? 2,
    lineStyle: definition.lineStyle,
    priceFormat: definition.format === "volume" ? { type: "volume" as const } : definition.format === "percent" ? { type: "custom" as const, formatter: (value: number) => `${value.toFixed(1)}%`, minMove: 0.01 } : { type: "price" as const, precision, minMove: 10 ** -precision },
  };
  if (definition.type === "area") return { ...common, lineColor: definition.color, topColor: definition.topColor ?? `${definition.color}40`, bottomColor: definition.bottomColor ?? `${definition.color}08` };
  if (definition.type === "baseline") return {
    ...common,
    baseValue: { type: "price" as const, price: 0 },
    topLineColor: definition.color,
    topFillColor1: definition.topColor ?? "rgba(24,168,121,.20)",
    topFillColor2: "rgba(24,168,121,.03)",
    bottomLineColor: kairoChartTheme.bearish,
    bottomFillColor1: "rgba(224,94,114,.03)",
    bottomFillColor2: definition.bottomColor ?? "rgba(224,94,114,.22)",
  };
  if (definition.type === "histogram") return { ...common, color: definition.color, priceLineVisible: false, lastValueVisible: false };
  return { ...common, color: definition.color };
}

function seriesData(definition: KairoChartSeriesDefinition) {
  return definition.data.map((point) => definition.type === "histogram" ? { time: point.time, value: point.value, color: point.color ?? definition.color } : { time: point.time, value: point.value });
}

function addSeries(chart: IChartApi, library: LightweightModule, definition: KairoChartSeriesDefinition, paneIndex = 0) {
  if (definition.type === "area") return chart.addSeries(library.AreaSeries, seriesOptions(definition), paneIndex) as AnySeries;
  if (definition.type === "baseline") return chart.addSeries(library.BaselineSeries, seriesOptions(definition), paneIndex) as AnySeries;
  if (definition.type === "histogram") return chart.addSeries(library.HistogramSeries, seriesOptions(definition), paneIndex) as AnySeries;
  return chart.addSeries(library.LineSeries, seriesOptions(definition), paneIndex) as AnySeries;
}

export function KairoTimeSeriesChart({
  ariaLabel,
  series,
  height = 420,
  compact = false,
  chartKey,
  currency,
  horizontalLines = [],
  referenceTime,
  referenceLabel = "Reference",
  showLegend = true,
  interactiveLegend = true,
  volume,
}: {
  ariaLabel: string;
  series: KairoChartSeriesDefinition[];
  height?: number;
  compact?: boolean;
  chartKey: string;
  currency?: string;
  horizontalLines?: KairoHorizontalLine[];
  referenceTime?: Time;
  referenceLabel?: string;
  showLegend?: boolean;
  interactiveLegend?: boolean;
  volume?: KairoChartSeriesDefinition;
}) {
  const hostRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const libraryRef = useRef<LightweightModule | null>(null);
  const registryRef = useRef(new Map<string, SeriesRecord>());
  const observerRef = useRef<ResizeObserver | null>(null);
  const fitKeyRef = useRef<string | null>(null);
  const referenceTimeRef = useRef<Time | undefined>(referenceTime);
  const [ready, setReady] = useState(0);
  const [visibility, setVisibility] = useState<{ chartKey: string; ids: Set<string> }>(() => ({ chartKey, ids: new Set() }));
  const [tooltip, setTooltip] = useState<TooltipState>(null);
  const [referenceX, setReferenceX] = useState<number | null>(null);
  const [chartWidth, setChartWidth] = useState(320);
  const hiddenIds = useMemo(() => visibility.chartKey === chartKey ? visibility.ids : new Set<string>(), [chartKey, visibility]);

  const allSeries = useMemo(() => volume ? [...series, volume] : series, [series, volume]);
  const hasVolume = Boolean(volume);
  const hasData = allSeries.some((definition) => definition.data.length > 0);
  const labelsByTime = useMemo(() => {
    const result = new Map<string, string>();
    for (const definition of allSeries) for (const point of definition.data) result.set(timeKey(point.time), point.label);
    return result;
  }, [allSeries]);
  const metadataBySeriesTime = useMemo(() => {
    const result = new Map<string, string>();
    for (const definition of allSeries) for (const point of definition.data) if (point.metadata) result.set(`${definition.id}:${timeKey(point.time)}`, point.metadata);
    return result;
  }, [allSeries]);
  const labelsRef = useRef(labelsByTime);
  const metadataRef = useRef(metadataBySeriesTime);
  useEffect(() => { labelsRef.current = labelsByTime; }, [labelsByTime]);
  useEffect(() => { metadataRef.current = metadataBySeriesTime; }, [metadataBySeriesTime]);
  useEffect(() => { referenceTimeRef.current = referenceTime; }, [referenceTime]);

  useEffect(() => {
    if (!hasData) return;
    let disposed = false;
    let localChart: IChartApi | null = null;
    let crosshairHandler: MouseEventHandler<Time> | null = null;
    let rangeHandler: (() => void) | null = null;
    const registry = registryRef.current;
    void import("lightweight-charts").then((library) => {
      if (disposed || !hostRef.current) return;
      libraryRef.current = library;
      const host = hostRef.current;
      fitKeyRef.current = null;
      localChart = library.createChart(host, {
        width: Math.max(1, host.clientWidth),
        height: host.clientHeight || height,
        layout: { background: { type: library.ColorType.Solid, color: kairoChartTheme.background }, textColor: kairoChartTheme.textSecondary, attributionLogo: true, fontFamily: "var(--font-sans, Inter, ui-sans-serif, system-ui)" },
        grid: { vertLines: { color: kairoChartTheme.grid, style: library.LineStyle.Dotted }, horzLines: { color: kairoChartTheme.grid, style: library.LineStyle.Dotted } },
        crosshair: { mode: library.CrosshairMode.Normal, vertLine: { color: kairoChartTheme.crosshair, width: 1, style: library.LineStyle.Dashed, labelBackgroundColor: kairoChartTheme.secondary }, horzLine: { color: kairoChartTheme.crosshair, width: 1, style: library.LineStyle.Dashed, labelBackgroundColor: kairoChartTheme.secondary } },
        rightPriceScale: { borderColor: kairoChartTheme.axis, scaleMargins: hasVolume ? { top: 0.08, bottom: 0.22 } : { top: 0.08, bottom: 0.08 } },
        timeScale: { borderColor: kairoChartTheme.axis, rightOffset: 2, barSpacing: compact ? 7 : 9, minBarSpacing: 1.5, timeVisible: true, secondsVisible: false, tickMarkFormatter: (time: Time) => labelsRef.current.get(timeKey(time)) ?? timeKey(time) },
        handleScroll: { mouseWheel: true, pressedMouseMove: true, horzTouchDrag: true, vertTouchDrag: false },
        handleScale: { axisPressedMouseMove: true, mouseWheel: true, pinch: true },
        kineticScroll: { mouse: true, touch: true },
      });
      chartRef.current = localChart;

      const updateReference = () => {
        const current = referenceTimeRef.current;
        setReferenceX(current === undefined ? null : localChart?.timeScale().timeToCoordinate(current) ?? null);
      };
      rangeHandler = updateReference;
      localChart.timeScale().subscribeVisibleLogicalRangeChange(rangeHandler);

      crosshairHandler = (parameter) => {
        if (!parameter.time || !parameter.point || parameter.point.x < 0 || parameter.point.y < 0) { setTooltip(null); return; }
        const entries: NonNullable<TooltipState>["entries"] = [];
        for (const [id, record] of registry) {
          if (id === "__volume") continue;
          const datum = parameter.seriesData.get(record.api);
          const value = datum && "value" in datum ? datum.value : datum && "close" in datum ? datum.close : null;
          if (typeof value !== "number") continue;
          entries.push({ id, label: record.definition.label, color: record.definition.color, value: formatKairoChartValue(value, record.definition.format, currency), metadata: metadataRef.current.get(`${id}:${timeKey(parameter.time)}`) });
        }
        if (!entries.length) { setTooltip(null); return; }
        setTooltip({ x: parameter.point.x, y: parameter.point.y, time: labelsRef.current.get(timeKey(parameter.time)) ?? timeKey(parameter.time), entries });
      };
      localChart.subscribeCrosshairMove(crosshairHandler);

      observerRef.current = new ResizeObserver((entries) => {
        const entry = entries[0];
        if (!entry || !localChart) return;
        const width = Math.max(1, Math.floor(entry.contentRect.width));
        localChart.resize(width, Math.max(1, Math.floor(entry.contentRect.height || host.clientHeight || height)));
        setChartWidth(width);
        updateReference();
      });
      observerRef.current.observe(host);
      setReady((value) => value + 1);
    });
    return () => {
      disposed = true;
      observerRef.current?.disconnect();
      observerRef.current = null;
      if (localChart && crosshairHandler) localChart.unsubscribeCrosshairMove(crosshairHandler);
      if (localChart && rangeHandler) localChart.timeScale().unsubscribeVisibleLogicalRangeChange(rangeHandler);
      localChart?.remove();
      registry.clear();
      if (chartRef.current === localChart) chartRef.current = null;
      libraryRef.current = null;
    };
  }, [compact, currency, hasData, hasVolume, height]);

  useEffect(() => {
    const chart = chartRef.current;
    const library = libraryRef.current;
    if (!chart || !library) return;
    const definitions = volume ? [...series, { ...volume, id: "__volume" }] : series;
    const nextIds = new Set(definitions.map((definition) => definition.id));
    for (const [id, record] of registryRef.current) {
      if (nextIds.has(id)) continue;
      chart.removeSeries(record.api);
      registryRef.current.delete(id);
    }
    definitions.forEach((original) => {
      const definition = { ...original, visible: original.visible !== false && !hiddenIds.has(original.id) };
      const existing = registryRef.current.get(definition.id);
      let record = existing;
      if (existing && existing.type !== definition.type) {
        chart.removeSeries(existing.api);
        registryRef.current.delete(definition.id);
        record = undefined;
      }
      if (!record) {
        const api = addSeries(chart, library, definition, definition.id === "__volume" ? 1 : 0);
        record = { api, type: definition.type, definition };
        registryRef.current.set(definition.id, record);
      }
      record.definition = definition;
      record.api.applyOptions(seriesOptions(definition) as never);
      record.api.setData(seriesData(definition) as never[]);
      if (definition.markers?.length) {
        if (!record.markers) record.markers = library.createSeriesMarkers(record.api, definition.markers);
        else record.markers.setMarkers(definition.markers);
      } else if (record.markers) record.markers.setMarkers([]);
    });

    const primary = definitions.find((definition) => definition.id !== "__volume");
    const primaryRecord = primary ? registryRef.current.get(primary.id) : null;
    if (primaryRecord) {
      for (const priceLine of primaryRecord.priceLines ?? []) primaryRecord.api.removePriceLine(priceLine);
      primaryRecord.priceLines = horizontalLines.map((line) => primaryRecord.api.createPriceLine({ price: line.value, color: line.color, title: "", lineWidth: line.lineWidth ?? 1, lineStyle: line.lineStyle ?? library.LineStyle.Dashed, axisLabelVisible: false }));
    }
    if (fitKeyRef.current !== chartKey) {
      fitKeyRef.current = chartKey;
      requestAnimationFrame(() => { chart.timeScale().fitContent(); const current = referenceTimeRef.current; setReferenceX(current === undefined ? null : chart.timeScale().timeToCoordinate(current)); });
    } else {
      const current = referenceTimeRef.current;
      setReferenceX(current === undefined ? null : chart.timeScale().timeToCoordinate(current));
    }
  }, [chartKey, hiddenIds, horizontalLines, ready, series, volume]);

  const summary = useMemo(() => {
    const values = series.flatMap((definition) => definition.data.map((point) => point.value)).filter(Number.isFinite);
    if (!values.length) return `${ariaLabel}. Data unavailable.`;
    return `${ariaLabel}. ${values.length} plotted values across ${series.length} series. Minimum ${Math.min(...values).toFixed(2)}, maximum ${Math.max(...values).toFixed(2)}.`;
  }, [ariaLabel, series]);

  if (!hasData) return <div className="kairo-chart-empty" role="status"><strong>No chart data</strong><span>Temporarily unavailable or insufficient history.</span></div>;

  return <div className="kairo-chart" role="img" aria-label={summary} data-chart-engine="lightweight-charts" data-chart-ready={ready > 0 ? "true" : "false"}>
    {showLegend && <div className="kairo-chart-legend" aria-label="Chart series">
      {series.filter((definition) => definition.showInLegend !== false).map((definition) => {
        const hidden = hiddenIds.has(definition.id) || definition.visible === false;
        return <button key={definition.id} type="button" aria-pressed={!hidden} disabled={!interactiveLegend} className={hidden ? "is-hidden" : ""} onClick={() => interactiveLegend && setVisibility((current) => { const next = new Set(current.chartKey === chartKey ? current.ids : []); if (next.has(definition.id)) next.delete(definition.id); else next.add(definition.id); return { chartKey, ids: next }; })}><i style={{ background: definition.color }}/>{definition.label}</button>;
      })}
      <button type="button" className="kairo-chart-reset" onClick={() => chartRef.current?.timeScale().fitContent()} aria-label="Reset chart view">Reset view</button>
    </div>}
    <div className="kairo-chart-stage" style={{ "--kairo-chart-height": `${height}px` } as CSSProperties}>
      <div ref={hostRef} className="kairo-chart-canvas"/>
      {referenceX !== null && <div className="kairo-reference-marker" style={{ left: referenceX }} aria-hidden="true"><span>{referenceLabel}</span></div>}
      {tooltip && <div className="kairo-chart-tooltip" style={{ left: Math.min(tooltip.x + 14, Math.max(8, chartWidth - 245)), top: Math.max(8, tooltip.y - 18) }} aria-hidden="true"><strong>{tooltip.time}</strong>{tooltip.entries.slice(0, 8).map((entry) => <div key={entry.id}><span><i style={{ background: entry.color }}/>{entry.label}</span><b>{entry.value}</b>{entry.metadata && <small>{entry.metadata}</small>}</div>)}</div>}
    </div>
    <div className="kairo-chart-footer"><span>Scroll to zoom · drag to explore</span></div>
    <p className="sr-only">{summary} Use the visible series controls to inspect the same values without requiring pointer hover.</p>
  </div>;
}
