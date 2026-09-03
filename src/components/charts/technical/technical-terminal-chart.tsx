"use client";

import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import type { IChartApi, IPriceLine, ISeriesApi, ISeriesMarkersPluginApi, LogicalRange, MouseEventParams, SeriesMarker, SeriesType, Time } from "lightweight-charts";
import { anchoredVwap, calculateIndicatorSeries, calculateVolumeProfile, drawingDefinition, fibonacciExtension, fibonacciRetracement, heikinAshi, horizontalRayDrawingSegment, normalizeSeriesAtCommonStart, rectangleDrawingSegments } from "@/engines/technical";
import type { MarketStructureResult, MtfTechnicalLevel, RangedVolumeProfileResult, TechnicalChartDataset, TechnicalChartType, TechnicalDivergence, TechnicalDrawing, TechnicalDrawingPoint, TechnicalDrawingTool, TechnicalIndicatorConfig, TechnicalLevel, TechnicalSessionAnalytics } from "@/types";
import { kairoChartTheme } from "../chart-theme";

export type { TechnicalDrawing } from "@/types";
type AnySeries = ISeriesApi<SeriesType>;
type LinkedCrosshair = { sourcePanelId: string; timestamp: string | null };

function time(timestamp: string) { return Math.floor(Date.parse(timestamp) / 1000) as Time; }
function timestampFromTime(value: Time) {
  if (typeof value === "number") return new Date(value * 1000).toISOString();
  if (typeof value === "string") return new Date(`${value}T00:00:00.000Z`).toISOString();
  return new Date(Date.UTC(value.year, value.month - 1, value.day)).toISOString();
}
function pricePrecision(bars: TechnicalChartDataset["bars"]) {
  const last = bars.at(-1)?.close ?? 1;
  return last >= 10 ? 2 : last >= 1 ? 3 : last >= 0.01 ? 4 : 6;
}
function priceLabel(value: number, precision: number) { return value.toLocaleString(undefined, { minimumFractionDigits: precision, maximumFractionDigits: precision }); }

export function TechnicalTerminalChart({ dataset, comparisons, chartType, indicators, drawings, drawingTool, drawingText = "Research note", selectedDrawingId = null, autoLevels = [], showVolumeProfile = false, marketStructure = null, structureDensity = "MAJOR", mtfLevels = [], divergences = [], rangedProfiles = [], sessionAnalytics = null, panelId = "panel-1", linkedCrosshair = null, onCrosshairTime, onCreateDrawing, onResetView }: {
  dataset: TechnicalChartDataset;
  comparisons: TechnicalChartDataset[];
  chartType: TechnicalChartType;
  indicators: TechnicalIndicatorConfig[];
  drawings: TechnicalDrawing[];
  drawingTool: TechnicalDrawingTool;
  drawingText?: string;
  selectedDrawingId?: string | null;
  autoLevels?: TechnicalLevel[];
  showVolumeProfile?: boolean;
  marketStructure?: MarketStructureResult | null;
  structureDensity?: "MAJOR" | "ALL";
  mtfLevels?: MtfTechnicalLevel[];
  divergences?: TechnicalDivergence[];
  rangedProfiles?: Array<RangedVolumeProfileResult & { id: string }>;
  sessionAnalytics?: TechnicalSessionAnalytics | null;
  panelId?: string;
  linkedCrosshair?: LinkedCrosshair | null;
  onCrosshairTime?: (panelId: string, timestamp: string | null) => void;
  onCreateDrawing: (drawing: TechnicalDrawing) => void;
  onResetView?: (reset: () => void) => void;
}) {
  const hostRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const libraryRef = useRef<typeof import("lightweight-charts") | null>(null);
  const primaryRef = useRef<AnySeries | null>(null);
  const drawingSeriesRef = useRef<AnySeries[]>([]);
  const drawingLinesRef = useRef<IPriceLine[]>([]);
  const markerPluginRef = useRef<ISeriesMarkersPluginApi<Time> | null>(null);
  const pendingAnchorsRef = useRef<TechnicalDrawingPoint[]>([]);
  const visibleTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const linkedReleaseTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const applyingLinkedCrosshairRef = useRef(false);
  const createDrawingRef = useRef(onCreateDrawing);
  const crosshairCallbackRef = useRef(onCrosshairTime);
  const drawingToolRef = useRef(drawingTool);
  const drawingTextRef = useRef(drawingText);
  const resetViewCallbackRef = useRef(onResetView);
  const comparisonsRef = useRef(comparisons);
  const autoLevelsRef = useRef(autoLevels);
  const [ready, setReady] = useState(false);
  const [anchorCount, setAnchorCount] = useState(0);
  const [visibleRange, setVisibleRange] = useState({ from: 0, to: Math.max(0, dataset.bars.length - 1) });
  const [tooltip, setTooltip] = useState<{ left: number; label: string; values: string[] } | null>(null);
  const calculated = useMemo(() => calculateIndicatorSeries(dataset.bars), [dataset.bars]);
  const displayBars = useMemo(() => chartType === "heikin-ashi" ? heikinAshi(dataset.bars) : dataset.bars, [chartType, dataset.bars]);
  const profile = useMemo(() => showVolumeProfile ? calculateVolumeProfile(dataset.bars.slice(visibleRange.from, visibleRange.to + 1)) : null, [dataset.bars, showVolumeProfile, visibleRange]);
  const comparisonSignature = comparisons.map((comparison) => `${comparison.symbol}:${comparison.timeframe}:${comparison.asOf ?? comparison.bars.length}`).join("|");
  const autoLevelsSignature = autoLevels.map((level) => `${level.id}:${level.score}:${level.status}`).join("|");

  useEffect(() => { createDrawingRef.current = onCreateDrawing; }, [onCreateDrawing]);
  useEffect(() => { crosshairCallbackRef.current = onCrosshairTime; }, [onCrosshairTime]);
  useEffect(() => { drawingTextRef.current = drawingText; }, [drawingText]);
  useEffect(() => { resetViewCallbackRef.current = onResetView; }, [onResetView]);
  useEffect(() => { comparisonsRef.current = comparisons; }, [comparisons]);
  useEffect(() => { autoLevelsRef.current = autoLevels; }, [autoLevels]);
  useLayoutEffect(() => { drawingToolRef.current = drawingTool; }, [drawingTool]);
  useEffect(() => { pendingAnchorsRef.current = []; queueMicrotask(() => setAnchorCount(0)); }, [drawingTool]);

  const placeDrawingAnchor = (clientX: number, clientY: number) => {
    const tool = drawingToolRef.current;
    const host = hostRef.current;
    const chart = chartRef.current;
    const primary = primaryRef.current;
    if (tool === "cursor" || !host || !chart || !primary) return;
    const bounds = host.getBoundingClientRect();
    const resolvedTime = chart.timeScale().coordinateToTime(clientX - bounds.left);
    const price = primary.coordinateToPrice(clientY - bounds.top);
    if (resolvedTime === null || resolvedTime === undefined || typeof price !== "number" || !Number.isFinite(price)) return;
    const definition = drawingDefinition(tool);
    if (!definition) return;
    const points = [...pendingAnchorsRef.current, { timestamp: timestampFromTime(resolvedTime), price }].slice(0, definition.anchors);
    pendingAnchorsRef.current = points;
    setAnchorCount(points.length);
    if (points.length === definition.anchors) {
      const text = tool === "text" ? drawingTextRef.current : undefined;
      createDrawingRef.current({ id: crypto.randomUUID(), type: tool, points, visible: true, createdAt: new Date().toISOString(), ...(text ? { text } : {}) });
      pendingAnchorsRef.current = [];
      setAnchorCount(0);
    }
  };

  useEffect(() => {
    if (!hostRef.current || !dataset.bars.length) return;
    let disposed = false;
    let chart: IChartApi | null = null;
    let observer: ResizeObserver | null = null;
    let crosshairHandler: ((parameter: MouseEventParams<Time>) => void) | null = null;
    let visibleHandler: ((range: LogicalRange | null) => void) | null = null;
    const registry: Array<{ label: string; series: AnySeries; suffix?: string }> = [];
    const comparisonData = comparisonsRef.current;
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
      if (chartType === "candlestick" || chartType === "heikin-ashi") {
        primary = chart.addSeries(library.CandlestickSeries, { ...common, upColor: kairoChartTheme.bullish, downColor: kairoChartTheme.bearish, borderVisible: false, wickUpColor: kairoChartTheme.bullish, wickDownColor: kairoChartTheme.bearish });
        primary.setData(displayBars.map((bar) => ({ time: time(bar.timestamp), open: bar.open, high: bar.high, low: bar.low, close: bar.close })) as never[]);
      } else if (chartType === "area") {
        primary = chart.addSeries(library.AreaSeries, { ...common, lineColor: kairoChartTheme.primary, topColor: `${kairoChartTheme.primary}42`, bottomColor: `${kairoChartTheme.primary}05`, lineWidth: 2 });
        primary.setData(dataset.bars.map((bar) => ({ time: time(bar.timestamp), value: bar.close })));
      } else {
        primary = chart.addSeries(library.LineSeries, { ...common, color: kairoChartTheme.primary, lineWidth: 2 });
        primary.setData(dataset.bars.map((bar) => ({ time: time(bar.timestamp), value: bar.close })));
      }
      primaryRef.current = primary;
      registry.push({ label: chartType === "heikin-ashi" ? `${dataset.symbol} · Heikin Ashi derived` : dataset.symbol, series: primary });
      const addLine = (label: string, values: Array<number | null>, color: string, targetPane = 0, options: Record<string, unknown> = {}) => {
        const series = chart!.addSeries(library.LineSeries, { color, lineWidth: 2, priceLineVisible: false, lastValueVisible: false, ...options }, targetPane) as AnySeries;
        series.setData(values.flatMap((value, index) => value === null || !Number.isFinite(value) ? [] : [{ time: time(dataset.bars[index].timestamp), value }]) as never[]);
        registry.push({ label, series });
        return series;
      };
      const enabled = indicators.filter((indicator) => indicator.enabled);
      for (const indicator of enabled) {
        if (indicator.kind === "SMA") addLine(`SMA ${indicator.period}`, calculated.sma(indicator.period ?? 20), indicator.color);
        if (indicator.kind === "EMA") addLine(`EMA ${indicator.period}`, calculated.ema(indicator.period ?? 20), indicator.color);
        if (indicator.kind === "VWAP" && !["1D", "1W"].includes(dataset.timeframe)) addLine("VWAP", calculated.vwap(), indicator.color);
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
          rsi.createPriceLine({ price: 50, color: kairoChartTheme.axis, lineWidth: 1, lineStyle: library.LineStyle.Dotted, axisLabelVisible: false, title: "50" });
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
      const normalized = normalizeSeriesAtCommonStart([dataset.bars.map((bar) => ({ timestamp: bar.timestamp, value: bar.close })), ...comparisonData.slice(0, 3).map((comparison) => comparison.bars.map((bar) => ({ timestamp: bar.timestamp, value: bar.close })))]);
      if (comparisonData.length > 0) {
        const primaryPerformance = chart.addSeries(library.LineSeries, { color: kairoChartTheme.primary, lineWidth: 2, priceScaleId: "compare", priceLineVisible: false, lastValueVisible: true, priceFormat: { type: "custom", formatter: (value: number) => `${value.toFixed(1)}%`, minMove: .01 } }) as AnySeries;
        primaryPerformance.setData(normalized[0].flatMap((value, pointIndex) => value === null ? [] : [{ time: time(dataset.bars[pointIndex].timestamp), value }]) as never[]);
        registry.push({ label: `${dataset.symbol} performance`, series: primaryPerformance, suffix: "%" });
      }
      comparisonData.slice(0, 3).forEach((comparison, index) => {
        const values = normalized[index + 1] ?? [];
        const series = chart!.addSeries(library.LineSeries, { color: compareColors[index], lineWidth: 2, priceScaleId: "compare", priceLineVisible: false, lastValueVisible: true, priceFormat: { type: "custom", formatter: (value: number) => `${value.toFixed(1)}%`, minMove: .01 } }) as AnySeries;
        series.setData(values.flatMap((value, pointIndex) => value === null ? [] : [{ time: time(comparison.bars[pointIndex].timestamp), value }]) as never[]);
        registry.push({ label: `${comparison.symbol} rebased`, series, suffix: "%" });
      });
      crosshairHandler = (parameter) => {
        if (!parameter.point || !parameter.time) {
          setTooltip((current) => current === null ? current : null);
          if (!applyingLinkedCrosshairRef.current) crosshairCallbackRef.current?.(panelId, null);
          return;
        }
        const values = registry.flatMap((record) => {
          const row = parameter.seriesData.get(record.series);
          const value = row && "value" in row ? row.value : row && "close" in row ? row.close : null;
          return typeof value === "number" ? [`${record.label} ${value.toLocaleString(undefined, { maximumFractionDigits: 3 })}${record.suffix ?? ""}`] : [];
        });
        const hostWidth = hostRef.current?.clientWidth ?? 560;
        const timestamp = timestampFromTime(parameter.time);
        const nextTooltip = { left: Math.max(8, Math.min(parameter.point.x + 12, hostWidth - 217)), label: new Date(timestamp).toLocaleString(), values };
        setTooltip((current) => current?.left === nextTooltip.left && current.label === nextTooltip.label && current.values.length === nextTooltip.values.length && current.values.every((value, index) => value === nextTooltip.values[index]) ? current : nextTooltip);
        if (!applyingLinkedCrosshairRef.current) crosshairCallbackRef.current?.(panelId, timestamp);
      };
      chart.subscribeCrosshairMove(crosshairHandler);
      visibleHandler = (range) => {
        if (!range) return;
        if (visibleTimerRef.current) clearTimeout(visibleTimerRef.current);
        visibleTimerRef.current = setTimeout(() => {
          const from = Math.max(0, Math.floor(range.from));
          const to = Math.min(dataset.bars.length - 1, Math.ceil(range.to));
          if (to >= from) setVisibleRange((current) => current.from === from && current.to === to ? current : { from, to });
        }, 120);
      };
      chart.timeScale().subscribeVisibleLogicalRangeChange(visibleHandler);
      chart.timeScale().fitContent();
      resetViewCallbackRef.current?.(() => chart?.timeScale().fitContent());
      const panes = chart.panes();
      if (panes[1]) panes[1].setHeight(95);
      for (let index = 2; index < panes.length; index += 1) panes[index].setHeight(115);
      observer = new ResizeObserver(([entry]) => chart?.resize(Math.max(1, Math.floor(entry.contentRect.width)), Math.max(320, Math.floor(entry.contentRect.height))));
      observer.observe(hostRef.current);
      setReady(true);
    });
    return () => {
      disposed = true;
      observer?.disconnect();
      if (visibleTimerRef.current) clearTimeout(visibleTimerRef.current);
      if (chart && crosshairHandler) chart.unsubscribeCrosshairMove(crosshairHandler);
      if (chart && visibleHandler) chart.timeScale().unsubscribeVisibleLogicalRangeChange(visibleHandler);
      chart?.remove();
      chartRef.current = null;
      libraryRef.current = null;
      primaryRef.current = null;
      drawingSeriesRef.current = [];
      drawingLinesRef.current = [];
      markerPluginRef.current = null;
      setReady(false);
    };
  }, [calculated, chartType, comparisonSignature, dataset, displayBars, indicators, panelId]);

  useEffect(() => {
    const chart = chartRef.current;
    const primary = primaryRef.current;
    const library = libraryRef.current;
    if (!ready || !chart || !primary || !library) return;
    for (const line of drawingLinesRef.current) try { primary.removePriceLine(line); } catch { /* Lifecycle cleanup. */ }
    for (const series of drawingSeriesRef.current) try { chart.removeSeries(series); } catch { /* Lifecycle cleanup. */ }
    drawingLinesRef.current = [];
    markerPluginRef.current?.detach();
    markerPluginRef.current = null;
    drawingSeriesRef.current = [];
    const precision = pricePrecision(dataset.bars);
    const addPriceLine = (price: number, title: string, color: string, width: 1 | 2 | 3 = 1) => drawingLinesRef.current.push(primary.createPriceLine({ price, color, lineWidth: width, lineStyle: library.LineStyle.Dashed, axisLabelVisible: true, title }));
    const addSeries = (points: TechnicalDrawingPoint[], color: string, width: 1 | 2 | 3 = 2) => {
      if (points.length < 2) return;
      const rows = [...points].sort((left, right) => Date.parse(left.timestamp) - Date.parse(right.timestamp));
      if (rows[0].timestamp === rows.at(-1)?.timestamp) rows[rows.length - 1] = { ...rows[rows.length - 1], timestamp: new Date(Date.parse(rows[rows.length - 1].timestamp) + 1000).toISOString() };
      const series = chart.addSeries(library.LineSeries, { color, lineWidth: width, priceLineVisible: false, lastValueVisible: false }) as AnySeries;
      series.setData(rows.map((point) => ({ time: time(point.timestamp), value: point.price })) as never[]);
      drawingSeriesRef.current.push(series);
    };
    autoLevelsRef.current.forEach((level) => addPriceLine(level.centerPrice, `${level.type} ${level.score}`, level.type === "SUPPORT" ? "rgba(24,168,121,.72)" : "rgba(224,94,114,.72)"));
    mtfLevels.slice(0, 8).forEach((level) => addPriceLine(level.centerPrice, `${level.type} · ${level.timeframes.join("+")}`, level.type === "SUPPORT" ? "rgba(21,126,100,.82)" : "rgba(190,70,94,.82)", level.confluenceCount > 1 ? 2 : 1));
    rangedProfiles.filter((profile) => profile.status === "AVAILABLE").slice(0, 5).forEach((profile) => {
      const prefix = profile.kind === "FIXED" ? "FIX" : "ANCH";
      const color = profile.kind === "FIXED" ? "rgba(82,103,232,.78)" : "rgba(147,51,234,.72)";
      if (profile.poc !== null) addPriceLine(profile.poc, `${prefix} POC`, color, 2);
      if (profile.vah !== null) addPriceLine(profile.vah, `${prefix} VAH`, color);
      if (profile.val !== null) addPriceLine(profile.val, `${prefix} VAL`, color);
    });
    if (sessionAnalytics?.status === "AVAILABLE") {
      if (sessionAnalytics.previousDayHigh !== null) addPriceLine(sessionAnalytics.previousDayHigh, "PDH", "rgba(82,103,232,.62)");
      if (sessionAnalytics.previousDayLow !== null) addPriceLine(sessionAnalytics.previousDayLow, "PDL", "rgba(82,103,232,.62)");
      if (sessionAnalytics.previousClose !== null) addPriceLine(sessionAnalytics.previousClose, "PDC", "rgba(102,117,139,.62)");
      if (sessionAnalytics.todayOpen !== null) addPriceLine(sessionAnalytics.todayOpen, "OPEN", "rgba(244,165,37,.72)");
      if (sessionAnalytics.openingRange15) { addPriceLine(sessionAnalytics.openingRange15.high, "OR15 H", "rgba(32,164,168,.62)"); addPriceLine(sessionAnalytics.openingRange15.low, "OR15 L", "rgba(32,164,168,.62)"); }
      if (sessionAnalytics.openingRange30) { addPriceLine(sessionAnalytics.openingRange30.high, "OR30 H", "rgba(32,164,168,.45)"); addPriceLine(sessionAnalytics.openingRange30.low, "OR30 L", "rgba(32,164,168,.45)"); }
    }
    drawings.filter((drawing) => drawing.visible).forEach((drawing) => {
      const selected = drawing.id === selectedDrawingId;
      const color = selected ? "#5267e8" : "#f4a525";
      const width = selected ? 3 : 2;
      if (drawing.type === "horizontal" && drawing.points[0]) addPriceLine(drawing.points[0].price, "Drawing", color, width);
      if (drawing.type === "trend" && drawing.points.length === 2) addSeries(drawing.points, color, width);
      if (drawing.type === "horizontal-ray" && drawing.points[0]) addSeries(horizontalRayDrawingSegment(drawing.points[0], dataset.bars.at(-1)!.timestamp), color, width);
      if (drawing.type === "vertical" && drawing.points[0]) addSeries([{ timestamp: drawing.points[0].timestamp, price: Math.min(...dataset.bars.map((bar) => bar.low)) }, { timestamp: new Date(Date.parse(drawing.points[0].timestamp) + 1000).toISOString(), price: Math.max(...dataset.bars.map((bar) => bar.high)) }], color, width);
      if (drawing.type === "rectangle" && drawing.points.length === 2) rectangleDrawingSegments(drawing.points[0], drawing.points[1]).forEach((segment) => addSeries(segment, color, width));
      if (drawing.type === "fib-retracement" && drawing.points.length === 2) fibonacciRetracement(drawing.points[0].price, drawing.points[1].price).forEach((level) => addPriceLine(level.price, `${level.ratio} — ${priceLabel(level.price, precision)}`, color));
      if (drawing.type === "fib-extension" && drawing.points.length === 3) fibonacciExtension(drawing.points[0].price, drawing.points[1].price, drawing.points[2].price).forEach((level) => addPriceLine(level.price, `${level.ratio} — ${priceLabel(level.price, precision)}`, color));
      if (drawing.type === "text" && drawing.points[0]) addPriceLine(drawing.points[0].price, drawing.text ?? "Note", color, width);
      if (drawing.type === "anchored-vwap" && drawing.points[0]) {
        const values = anchoredVwap(dataset.bars, drawing.points[0].timestamp);
        addSeries(values.flatMap<TechnicalDrawingPoint>((value, index) => value === null ? [] : [{ timestamp: dataset.bars[index].timestamp, price: value }]), color, width);
      }
    });
    divergences.slice(-12).forEach((divergence) => addSeries([{ timestamp: divergence.pricePivot1.timestamp, price: divergence.pricePivot1.price }, { timestamp: divergence.pricePivot2.timestamp, price: divergence.pricePivot2.price }], divergence.direction === "BULLISH" ? "rgba(24,168,121,.82)" : "rgba(224,94,114,.82)", 2));
    const markers: SeriesMarker<Time>[] = [];
    marketStructure?.swings.filter((swing) => structureDensity === "ALL" || swing.hierarchy === "MAJOR").slice(-30).forEach((swing) => markers.push({ time: time(swing.timestamp), position: swing.kind === "HIGH" ? "aboveBar" : "belowBar", color: swing.kind === "HIGH" ? "#66758b" : "#5267e8", shape: "circle", text: swing.label, size: 1 }));
    marketStructure?.events.slice(-12).forEach((event) => markers.push({ time: time(event.confirmationTimestamp), position: event.direction === "BULLISH" ? "belowBar" : "aboveBar", color: event.type === "CHOCH" ? "#f4a525" : event.direction === "BULLISH" ? "#18a879" : "#e05e72", shape: event.direction === "BULLISH" ? "arrowUp" : "arrowDown", text: event.type, size: 1.3 }));
    divergences.slice(-8).forEach((divergence) => markers.push({ time: time(divergence.confirmedAt), position: divergence.direction === "BULLISH" ? "belowBar" : "aboveBar", color: divergence.direction === "BULLISH" ? "#18a879" : "#e05e72", shape: divergence.direction === "BULLISH" ? "arrowUp" : "arrowDown", text: `${divergence.indicator} DIV`, size: 1 }));
    if (markers.length) markerPluginRef.current = library.createSeriesMarkers(primary, markers);
  }, [autoLevelsSignature, dataset.bars, divergences, drawings, marketStructure, mtfLevels, rangedProfiles, ready, selectedDrawingId, sessionAnalytics, structureDensity]);

  useEffect(() => {
    if (!ready || !linkedCrosshair || linkedCrosshair.sourcePanelId === panelId) return;
    const chart = chartRef.current;
    const primary = primaryRef.current;
    if (!chart || !primary) return;
    applyingLinkedCrosshairRef.current = true;
    if (linkedReleaseTimerRef.current) clearTimeout(linkedReleaseTimerRef.current);
    if (!linkedCrosshair.timestamp) chart.clearCrosshairPosition();
    else {
      const linkedTime = time(linkedCrosshair.timestamp);
      const target = dataset.bars.find((bar) => time(bar.timestamp) === linkedTime);
      if (target) chart.setCrosshairPosition(target.close, time(target.timestamp), primary);
      else chart.clearCrosshairPosition();
    }
    linkedReleaseTimerRef.current = setTimeout(() => { applyingLinkedCrosshairRef.current = false; }, 0);
    return () => { if (linkedReleaseTimerRef.current) clearTimeout(linkedReleaseTimerRef.current); };
  }, [dataset.bars, linkedCrosshair, panelId, ready]);

  const definition = drawingTool === "cursor" ? null : drawingDefinition(drawingTool);
  const profileMax = Math.max(1, ...(profile?.bins.map((bin) => bin.volume) ?? [1]));
  return <div className={`technical-chart-stage ${drawingTool !== "cursor" ? "is-drawing" : ""}`} onClick={(event) => placeDrawingAnchor(event.clientX, event.clientY)} role="img" aria-label={`${dataset.symbol} professional technical chart. ${dataset.bars.length} verified OHLCV bars. ${chartType === "heikin-ashi" ? "Heikin Ashi is derived while studies use real OHLC. " : ""}Indicators: ${indicators.filter((item) => item.enabled).map((item) => item.kind).join(", ") || "none"}.`} data-chart-engine="lightweight-charts" data-chart-ready={ready ? "true" : "false"} data-drawing-tool={drawingTool} data-testid="technical-terminal-chart">
    <div ref={hostRef} className="technical-chart-canvas"/>
    {!ready && <div className="technical-chart-loading" role="status">Preparing chart engine…</div>}
    {definition && anchorCount > 0 && <div className="technical-drawing-status" role="status">Anchor {anchorCount}/{definition.anchors} selected · choose next point</div>}
    {chartType === "heikin-ashi" && <div className="technical-derived-badge">HEIKIN ASHI · DERIVED</div>}
    {profile?.status === "AVAILABLE" && <div className="technical-volume-profile" aria-label={`Estimated volume-at-price profile. POC ${profile.poc}, VAH ${profile.vah}, VAL ${profile.val}.`}>
      {profile.bins.slice().reverse().map((bin) => <i key={`${bin.priceLow}-${bin.priceHigh}`} className={`${bin.valueArea ? "value-area" : ""} ${bin.centerPrice === profile.poc ? "poc" : ""}`} style={{ width: `${Math.max(3, bin.volume / profileMax * 100)}%` }} title={`${priceLabel(bin.priceLow, pricePrecision(dataset.bars))}–${priceLabel(bin.priceHigh, pricePrecision(dataset.bars))}`}/>) }
      <span>Estimated from bar OHLCV</span>
    </div>}
    {showVolumeProfile && profile?.status === "UNAVAILABLE" && <div className="technical-profile-unavailable">Volume profile unavailable</div>}
    {tooltip && <div className="technical-crosshair-tooltip" style={{ left: tooltip.left }} aria-hidden="true"><strong>{tooltip.label}</strong>{tooltip.values.slice(0, 9).map((value) => <span key={value}>{value}</span>)}</div>}
  </div>;
}
