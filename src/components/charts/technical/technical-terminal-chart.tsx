"use client";

import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import type { IChartApi, IPriceLine, ISeriesApi, MouseEventParams, SeriesType, Time } from "lightweight-charts";
import { calculateIndicatorSeries, normalizedComparison } from "@/engines/technical";
import type { TechnicalChartDataset, TechnicalChartType, TechnicalIndicatorConfig } from "@/types";
import { kairoChartTheme } from "../chart-theme";

export type TechnicalDrawing = {
  id: string;
  type: "horizontal" | "trend";
  points: Array<{ timestamp: string; price: number }>;
};

type DrawingTool = "cursor" | "horizontal" | "trend";
type AnySeries = ISeriesApi<SeriesType>;

function time(timestamp: string) { return Math.floor(Date.parse(timestamp) / 1000) as Time; }
function pricePrecision(bars: TechnicalChartDataset["bars"]) {
  const last = bars.at(-1)?.close ?? 1;
  return last >= 10 ? 2 : last >= 1 ? 3 : last >= 0.01 ? 4 : 6;
}

export function TechnicalTerminalChart({ dataset, comparisons, chartType, indicators, drawings, drawingTool, onCreateDrawing, onResetView }: {
  dataset: TechnicalChartDataset;
  comparisons: TechnicalChartDataset[];
  chartType: TechnicalChartType;
  indicators: TechnicalIndicatorConfig[];
  drawings: TechnicalDrawing[];
  drawingTool: DrawingTool;
  onCreateDrawing: (drawing: TechnicalDrawing) => void;
  onResetView?: (reset: () => void) => void;
}) {
  const hostRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const libraryRef = useRef<typeof import("lightweight-charts") | null>(null);
  const primaryRef = useRef<AnySeries | null>(null);
  const drawingSeriesRef = useRef<AnySeries[]>([]);
  const drawingLinesRef = useRef<IPriceLine[]>([]);
  const trendAnchorRef = useRef<{ timestamp: string; price: number } | null>(null);
  const createDrawingRef = useRef(onCreateDrawing);
  const drawingToolRef = useRef(drawingTool);
  const [ready, setReady] = useState(false);
  const [trendAnchor, setTrendAnchor] = useState<{ timestamp: string; price: number } | null>(null);
  const [tooltip, setTooltip] = useState<{ x: number; label: string; values: string[] } | null>(null);
  const calculated = useMemo(() => calculateIndicatorSeries(dataset.bars), [dataset.bars]);

  useEffect(() => { createDrawingRef.current = onCreateDrawing; }, [onCreateDrawing]);
  useLayoutEffect(() => { drawingToolRef.current = drawingTool; }, [drawingTool]);
  useEffect(() => {
    if (drawingTool !== "trend") queueMicrotask(() => { trendAnchorRef.current = null; setTrendAnchor(null); });
  }, [drawingTool]);

  useEffect(() => {
    if (!hostRef.current || !dataset.bars.length) return;
    let disposed = false;
    let chart: IChartApi | null = null;
    let observer: ResizeObserver | null = null;
    let clickHandler: ((parameter: MouseEventParams<Time>) => void) | null = null;
    let crosshairHandler: ((parameter: MouseEventParams<Time>) => void) | null = null;
    const registry: Array<{ label: string; series: AnySeries; suffix?: string }> = [];
    void import("lightweight-charts").then((library) => {
      if (disposed || !hostRef.current) return;
      const precision = pricePrecision(dataset.bars);
      chart = library.createChart(hostRef.current, {
        width: hostRef.current.clientWidth,
        height: hostRef.current.clientHeight,
        layout: { background: { type: library.ColorType.Solid, color: "#fff" }, textColor: kairoChartTheme.textSecondary, attributionLogo: true, panes: { separatorColor: kairoChartTheme.grid, separatorHoverColor: kairoChartTheme.primary, enableResize: true }, fontFamily: "var(--font-sans, Inter, ui-sans-serif, system-ui)" },
        grid: { vertLines: { color: kairoChartTheme.grid, style: library.LineStyle.Dotted }, horzLines: { color: kairoChartTheme.grid, style: library.LineStyle.Dotted } },
        crosshair: { mode: library.CrosshairMode.Normal, vertLine: { color: kairoChartTheme.crosshair, style: library.LineStyle.Dashed }, horzLine: { color: kairoChartTheme.crosshair, style: library.LineStyle.Dashed } },
        timeScale: { borderColor: kairoChartTheme.axis, timeVisible: !["1D", "1W"].includes(dataset.timeframe), secondsVisible: false, rightOffset: 3, barSpacing: 7, minBarSpacing: 1.2 },
        rightPriceScale: { borderColor: kairoChartTheme.axis, scaleMargins: { top: 0.08, bottom: 0.08 } },
        handleScroll: { mouseWheel: true, pressedMouseMove: true, horzTouchDrag: true, vertTouchDrag: false },
        handleScale: { axisPressedMouseMove: true, mouseWheel: true, pinch: true },
      });
      chartRef.current = chart;
      libraryRef.current = library;
      const common = { priceFormat: { type: "price" as const, precision, minMove: 10 ** -precision }, priceLineVisible: false, lastValueVisible: true };
      let primary: AnySeries;
      if (chartType === "candlestick") {
        primary = chart.addSeries(library.CandlestickSeries, { ...common, upColor: kairoChartTheme.bullish, downColor: kairoChartTheme.bearish, borderVisible: false, wickUpColor: kairoChartTheme.bullish, wickDownColor: kairoChartTheme.bearish });
        primary.setData(dataset.bars.map((bar) => ({ time: time(bar.timestamp), open: bar.open, high: bar.high, low: bar.low, close: bar.close })) as never[]);
      } else if (chartType === "area") {
        primary = chart.addSeries(library.AreaSeries, { ...common, lineColor: kairoChartTheme.primary, topColor: `${kairoChartTheme.primary}42`, bottomColor: `${kairoChartTheme.primary}05`, lineWidth: 2 });
        primary.setData(dataset.bars.map((bar) => ({ time: time(bar.timestamp), value: bar.close })));
      } else {
        primary = chart.addSeries(library.LineSeries, { ...common, color: kairoChartTheme.primary, lineWidth: 2 });
        primary.setData(dataset.bars.map((bar) => ({ time: time(bar.timestamp), value: bar.close })));
      }
      primaryRef.current = primary;
      registry.push({ label: dataset.symbol, series: primary });

      const addLine = (label: string, values: Array<number | null>, color: string, pane = 0, options: Record<string, unknown> = {}) => {
        const series = chart!.addSeries(library.LineSeries, { color, lineWidth: 2, priceLineVisible: false, lastValueVisible: false, ...options }, pane) as AnySeries;
        series.setData(values.flatMap((value, index) => value === null || !Number.isFinite(value) ? [] : [{ time: time(dataset.bars[index].timestamp), value }]) as never[]);
        registry.push({ label, series, suffix: pane >= 2 ? "" : undefined });
        return series;
      };
      const enabled = indicators.filter((indicator) => indicator.enabled);
      for (const indicator of enabled) {
        if (indicator.kind === "SMA") addLine(`SMA ${indicator.period}`, calculated.sma(indicator.period ?? 20), indicator.color);
        if (indicator.kind === "EMA") addLine(`EMA ${indicator.period}`, calculated.ema(indicator.period ?? 20), indicator.color);
        if (indicator.kind === "VWAP") addLine("VWAP", calculated.vwap(), indicator.color);
        if (indicator.kind === "BOLLINGER") {
          const bands = calculated.bollinger(indicator.period ?? 20);
          addLine("BB upper", bands.upper, indicator.color, 0, { lineWidth: 1 });
          addLine("BB middle", bands.middle, indicator.color, 0, { lineWidth: 1, lineStyle: library.LineStyle.Dashed });
          addLine("BB lower", bands.lower, indicator.color, 0, { lineWidth: 1 });
        }
      }

      let pane = 1;
      if (enabled.some((item) => item.kind === "VOLUME")) {
        const volume = chart.addSeries(library.HistogramSeries, { priceFormat: { type: "volume" }, priceLineVisible: false, lastValueVisible: false }, pane) as AnySeries;
        volume.setData(dataset.bars.map((bar) => ({ time: time(bar.timestamp), value: bar.volume, color: bar.close >= bar.open ? "rgba(24,168,121,.30)" : "rgba(224,94,114,.30)" })) as never[]);
        registry.push({ label: "Volume", series: volume });
        pane += 1;
      }
      for (const indicator of enabled) {
        if (indicator.kind === "RSI") {
          const rsi = addLine(`RSI ${indicator.period ?? 14}`, calculated.rsi(indicator.period ?? 14), indicator.color, pane, { priceFormat: { type: "price", precision: 1, minMove: .1 } });
          rsi.createPriceLine({ price: 70, color: kairoChartTheme.bearish, lineWidth: 1, lineStyle: library.LineStyle.Dashed, axisLabelVisible: true, title: "70" });
          rsi.createPriceLine({ price: 30, color: kairoChartTheme.bullish, lineWidth: 1, lineStyle: library.LineStyle.Dashed, axisLabelVisible: true, title: "30" });
          pane += 1;
        }
        if (indicator.kind === "MACD") {
          const macd = calculated.macd();
          addLine("MACD", macd.macd, indicator.color, pane);
          addLine("Signal", macd.signal, kairoChartTheme.bearish, pane);
          const histogram = chart.addSeries(library.HistogramSeries, { priceLineVisible: false, lastValueVisible: false }, pane) as AnySeries;
          histogram.setData(macd.histogram.flatMap((value, index) => value === null ? [] : [{ time: time(dataset.bars[index].timestamp), value, color: value >= 0 ? "rgba(24,168,121,.42)" : "rgba(224,94,114,.42)" }]) as never[]);
          registry.push({ label: "MACD histogram", series: histogram });
          pane += 1;
        }
        if (indicator.kind === "ATR") { addLine(`ATR ${indicator.period ?? 14}`, calculated.atr(indicator.period ?? 14), indicator.color, pane); pane += 1; }
      }

      const compareColors = [kairoChartTheme.comparison, "#f4a525", "#9333ea"];
      comparisons.slice(0, 3).forEach((comparison, index) => {
        const values = normalizedComparison(comparison.bars.map((bar) => bar.close));
        const series = chart!.addSeries(library.LineSeries, { color: compareColors[index], lineWidth: 2, priceScaleId: "compare", priceLineVisible: false, lastValueVisible: true, priceFormat: { type: "custom", formatter: (value: number) => `${value.toFixed(1)}%`, minMove: .01 } }) as AnySeries;
        series.setData(values.flatMap((value, pointIndex) => value === null ? [] : [{ time: time(comparison.bars[pointIndex].timestamp), value }]) as never[]);
        registry.push({ label: `${comparison.symbol} rebased`, series, suffix: "%" });
      });

      clickHandler = (parameter) => {
        if (drawingToolRef.current === "cursor" || !parameter.point) return;
        const resolvedTime = parameter.time ?? chart?.timeScale().coordinateToTime(parameter.point.x);
        if (resolvedTime === null || resolvedTime === undefined) return;
        const price = primary.coordinateToPrice(parameter.point.y);
        if (typeof price !== "number" || !Number.isFinite(price)) return;
        const timestamp = new Date((typeof resolvedTime === "number" ? resolvedTime : Date.parse(String(resolvedTime)) / 1000) * 1000).toISOString();
        if (drawingToolRef.current === "horizontal") createDrawingRef.current({ id: crypto.randomUUID(), type: "horizontal", points: [{ timestamp, price }] });
        else if (!trendAnchorRef.current) { trendAnchorRef.current = { timestamp, price }; setTrendAnchor(trendAnchorRef.current); }
        else { const start = trendAnchorRef.current; trendAnchorRef.current = null; setTrendAnchor(null); createDrawingRef.current({ id: crypto.randomUUID(), type: "trend", points: [start, { timestamp, price }] }); }
      };
      chart.subscribeClick(clickHandler);

      crosshairHandler = (parameter) => {
        if (!parameter.point || !parameter.time) { setTooltip(null); return; }
        const values = registry.flatMap((record) => {
          const row = parameter.seriesData.get(record.series);
          const value = row && "value" in row ? row.value : row && "close" in row ? row.close : null;
          return typeof value === "number" ? [`${record.label} ${value.toLocaleString(undefined, { maximumFractionDigits: 3 })}${record.suffix ?? ""}`] : [];
        });
        setTooltip({ x: parameter.point.x, label: typeof parameter.time === "number" ? new Date(parameter.time * 1000).toLocaleString() : String(parameter.time), values });
      };
      chart.subscribeCrosshairMove(crosshairHandler);
      chart.timeScale().fitContent();
      onResetView?.(() => chart?.timeScale().fitContent());
      const panes = chart.panes();
      if (panes[1]) panes[1].setHeight(95);
      for (let index = 2; index < panes.length; index += 1) panes[index].setHeight(115);
      observer = new ResizeObserver(([entry]) => chart?.resize(Math.max(1, Math.floor(entry.contentRect.width)), Math.max(420, Math.floor(entry.contentRect.height))));
      observer.observe(hostRef.current);
      setReady(true);
    });
    return () => {
      disposed = true;
      observer?.disconnect();
      if (chart && clickHandler) chart.unsubscribeClick(clickHandler);
      if (chart && crosshairHandler) chart.unsubscribeCrosshairMove(crosshairHandler);
      chart?.remove();
      chartRef.current = null;
      libraryRef.current = null;
      primaryRef.current = null;
      drawingSeriesRef.current = [];
      drawingLinesRef.current = [];
      setReady(false);
    };
  }, [calculated, chartType, comparisons, dataset, indicators, onResetView]);

  useEffect(() => {
    const chart = chartRef.current;
    const primary = primaryRef.current;
    const library = libraryRef.current;
    if (!ready || !chart || !primary || !library) return;
    for (const line of drawingLinesRef.current) {
      try { primary.removePriceLine(line); } catch { /* Chart lifecycle already owns cleanup. */ }
    }
    for (const series of drawingSeriesRef.current) {
      try { chart.removeSeries(series); } catch { /* Chart lifecycle already owns cleanup. */ }
    }
    drawingLinesRef.current = [];
    drawingSeriesRef.current = [];
    for (const drawing of drawings) {
      if (drawing.type === "horizontal" && drawing.points[0]) drawingLinesRef.current.push(primary.createPriceLine({ price: drawing.points[0].price, color: "#f4a525", lineWidth: 2, lineStyle: library.LineStyle.Dashed, axisLabelVisible: true, title: "Drawing" }));
      if (drawing.type === "trend" && drawing.points.length === 2) {
        const series = chart.addSeries(library.LineSeries, { color: "#f4a525", lineWidth: 2, priceLineVisible: false, lastValueVisible: false }) as AnySeries;
        series.setData(drawing.points.map((point) => ({ time: time(point.timestamp), value: point.price })) as never[]);
        drawingSeriesRef.current.push(series);
      }
    }
  }, [drawings, ready]);

  return <div className={`technical-chart-stage ${drawingTool !== "cursor" ? "is-drawing" : ""}`} role="img" aria-label={`${dataset.symbol} professional technical chart. ${dataset.bars.length} verified OHLCV bars. Indicators: ${indicators.filter((item) => item.enabled).map((item) => item.kind).join(", ") || "none"}.`} data-chart-engine="lightweight-charts" data-chart-ready={ready ? "true" : "false"} data-drawing-tool={drawingTool} data-testid="technical-terminal-chart">
    <div ref={hostRef} className="technical-chart-canvas"/>
    {!ready && <div className="technical-chart-loading" role="status">Preparing chart engine…</div>}
    {drawingTool === "trend" && trendAnchor && <div className="technical-drawing-status" role="status">Start selected · choose the end point</div>}
    {tooltip && <div className="technical-crosshair-tooltip" style={{ left: Math.min(tooltip.x + 12, 520) }} aria-hidden="true"><strong>{tooltip.label}</strong>{tooltip.values.slice(0, 9).map((value) => <span key={value}>{value}</span>)}</div>}
  </div>;
}
