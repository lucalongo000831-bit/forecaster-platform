"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { AreaChart, BarChart3, CandlestickChart, ChevronDown, Eraser, Expand, LineChart, MousePointer2, Plus, RotateCcw, Ruler, Trash2 } from "lucide-react";
import type { ApiSuccess, TechnicalChartDataset, TechnicalChartResponse, TechnicalChartType, TechnicalIndicatorConfig, TechnicalIndicatorKind, TechnicalTimeframe } from "@/types";
import { TECHNICAL_TIMEFRAMES, calculateIndicatorSeries } from "@/engines/technical";
import { TechnicalTerminalChart, type TechnicalDrawing } from "@/components/charts/technical/technical-terminal-chart";

type DrawingTool = "cursor" | "horizontal" | "trend";
type StoredPreferences = {
  version: 1;
  chartType: TechnicalChartType;
  timeframe: TechnicalTimeframe;
  indicators: TechnicalIndicatorConfig[];
  comparisons: string[];
  drawings: Partial<Record<TechnicalTimeframe, TechnicalDrawing[]>>;
};

const DEFAULT_INDICATORS: TechnicalIndicatorConfig[] = [
  { id: "volume", kind: "VOLUME", color: "#5267e8", enabled: true },
  { id: "ema-20", kind: "EMA", period: 20, color: "#20a4a8", enabled: true },
  { id: "ema-50", kind: "EMA", period: 50, color: "#f4a525", enabled: true },
];
const INDICATOR_COLORS = ["#626ee8", "#20a4a8", "#f4a525", "#e05e72", "#18a879", "#9333ea"];
const memoryCache = new Map<string, TechnicalChartResponse>();

function storageKey(symbol: string) { return `kairo:technical-chart:v1:${symbol.toUpperCase()}`; }
function indicatorNeedsPeriod(kind: TechnicalIndicatorKind) { return ["SMA", "EMA", "BOLLINGER", "RSI", "ATR"].includes(kind); }
function validIndicatorPeriod(value: number) { return Number.isInteger(value) && value >= 2 && value <= 250; }
function indicatorAvailable(kind: TechnicalIndicatorKind, timeframe: TechnicalTimeframe) { return kind !== "VWAP" || !["1D", "1W"].includes(timeframe); }
function validDrawing(value: unknown): value is TechnicalDrawing {
  if (!value || typeof value !== "object") return false;
  const drawing = value as Partial<TechnicalDrawing>;
  return typeof drawing.id === "string" && ["horizontal", "trend"].includes(drawing.type ?? "") && Array.isArray(drawing.points)
    && drawing.points.length === (drawing.type === "horizontal" ? 1 : 2)
    && drawing.points.every((point) => point && typeof point.timestamp === "string" && Number.isFinite(Date.parse(point.timestamp)) && typeof point.price === "number" && Number.isFinite(point.price) && point.price > 0);
}

async function requestDataset(symbol: string, timeframe: TechnicalTimeframe, force = false): Promise<TechnicalChartResponse> {
  const key = `${symbol.toUpperCase()}:${timeframe}`;
  if (!force && memoryCache.has(key)) return memoryCache.get(key)!;
  let lastError: Error | null = null;
  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      const response = await fetch(`/api/analysis/technical-chart?symbol=${encodeURIComponent(symbol)}&timeframe=${encodeURIComponent(timeframe)}`, { cache: "no-store" });
      const body = await response.json() as ApiSuccess<TechnicalChartDataset> | { error?: { message?: string } };
      if (!response.ok || !("data" in body)) throw new Error("error" in body ? body.error?.message ?? "Technical data unavailable." : "Technical data unavailable.");
      const result = body as TechnicalChartResponse;
      memoryCache.set(key, result);
      return result;
    } catch (error) {
      lastError = error instanceof Error ? error : new Error("Technical data unavailable.");
      if (attempt === 0) await new Promise((resolve) => window.setTimeout(resolve, 250));
    }
  }
  throw lastError ?? new Error("Technical data unavailable.");
}

function describeTechnical(dataset: TechnicalChartDataset, indicators: TechnicalIndicatorConfig[]) {
  if (dataset.bars.length < 2) return { trend: "Insufficient history", momentum: "Unavailable", volatility: "Unavailable" };
  const engine = calculateIndicatorSeries(dataset.bars);
  const last = dataset.bars.at(-1)!.close;
  const ema20 = engine.ema(20).at(-1);
  const ema50 = engine.ema(50).at(-1);
  const rsi = engine.rsi(14).at(-1);
  const atr = engine.atr(14).at(-1);
  const trend = typeof ema20 === "number" && typeof ema50 === "number" ? last > ema20 && ema20 > ema50 ? "Uptrend structure" : last < ema20 && ema20 < ema50 ? "Downtrend structure" : "Mixed structure" : "Warming up";
  const momentum = typeof rsi === "number" ? rsi >= 70 ? "Elevated RSI" : rsi <= 30 ? "Depressed RSI" : `Balanced RSI ${rsi.toFixed(1)}` : "Warming up";
  const volatility = typeof atr === "number" ? `ATR ${(atr / last * 100).toFixed(2)}% of price` : "Warming up";
  void indicators;
  return { trend, momentum, volatility };
}

export function TechnicalChartWorkspace({ symbol }: { symbol: string }) {
  const normalized = symbol.toUpperCase();
  const shellRef = useRef<HTMLDivElement>(null);
  const resetViewRef = useRef<() => void>(() => undefined);
  const [chartType, setChartType] = useState<TechnicalChartType>("candlestick");
  const [timeframe, setTimeframe] = useState<TechnicalTimeframe>("1D");
  const [indicators, setIndicators] = useState<TechnicalIndicatorConfig[]>(DEFAULT_INDICATORS);
  const [comparisons, setComparisons] = useState<string[]>([]);
  const [drawings, setDrawings] = useState<Partial<Record<TechnicalTimeframe, TechnicalDrawing[]>>>({});
  const [dataset, setDataset] = useState<TechnicalChartResponse | null>(null);
  const [comparisonData, setComparisonData] = useState<TechnicalChartDataset[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [compareInput, setCompareInput] = useState("");
  const [drawingTool, setDrawingTool] = useState<DrawingTool>("cursor");
  const [indicatorKind, setIndicatorKind] = useState<TechnicalIndicatorKind>("SMA");
  const [indicatorPeriod, setIndicatorPeriod] = useState(20);
  const [indicatorError, setIndicatorError] = useState("");
  const [fullscreenError, setFullscreenError] = useState("");
  const [resetArmed, setResetArmed] = useState(false);
  const [preferencesReady, setPreferencesReady] = useState(false);

  useEffect(() => {
    queueMicrotask(() => {
      try {
        const raw = localStorage.getItem(storageKey(normalized));
        const parsed = raw ? JSON.parse(raw) as Partial<StoredPreferences> : null;
        if (parsed?.version === 1) {
          if (["candlestick", "line", "area"].includes(parsed.chartType ?? "")) setChartType(parsed.chartType as TechnicalChartType);
          if (TECHNICAL_TIMEFRAMES.includes(parsed.timeframe as TechnicalTimeframe)) setTimeframe(parsed.timeframe as TechnicalTimeframe);
          const restoredIndicators = Array.isArray(parsed.indicators) ? parsed.indicators.filter((indicator): indicator is TechnicalIndicatorConfig => Boolean(indicator)
            && typeof indicator.id === "string" && ["SMA", "EMA", "BOLLINGER", "RSI", "MACD", "ATR", "VWAP", "VOLUME"].includes(indicator.kind)
            && typeof indicator.enabled === "boolean" && typeof indicator.color === "string"
            && (!indicatorNeedsPeriod(indicator.kind) || validIndicatorPeriod(indicator.period ?? Number.NaN))).slice(0, 12) : [];
          setIndicators(restoredIndicators.length ? restoredIndicators : DEFAULT_INDICATORS);
          setComparisons(Array.isArray(parsed.comparisons) ? parsed.comparisons.filter((value): value is string => typeof value === "string" && /^(?:\^[A-Z0-9][A-Z0-9.-]{0,29}|[A-Z0-9][A-Z0-9.^=-]{0,30})$/.test(value)).slice(0, 3) : []);
          const restoredDrawings: Partial<Record<TechnicalTimeframe, TechnicalDrawing[]>> = {};
          if (parsed.drawings && typeof parsed.drawings === "object") for (const value of TECHNICAL_TIMEFRAMES) {
            const candidates = parsed.drawings[value];
            if (Array.isArray(candidates)) restoredDrawings[value] = candidates.filter(validDrawing).slice(0, 100);
          }
          setDrawings(restoredDrawings);
        }
      } catch { /* Corrupt preferences are ignored safely. */ }
      setPreferencesReady(true);
    });
  }, [normalized]);

  useEffect(() => {
    if (!preferencesReady) return;
    localStorage.setItem(storageKey(normalized), JSON.stringify({ version: 1, chartType, timeframe, indicators, comparisons, drawings } satisfies StoredPreferences));
  }, [chartType, comparisons, drawings, indicators, normalized, preferencesReady, timeframe]);

  const load = useCallback(async (force = false) => {
    setLoading(true); setError("");
    try {
      const primary = await requestDataset(normalized, timeframe, force);
      setDataset(primary);
      const compared = await Promise.all(comparisons.map((comparison) => requestDataset(comparison, timeframe, force).then((response) => response.data).catch(() => null)));
      setComparisonData(compared.filter((value): value is TechnicalChartDataset => value !== null));
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Technical data temporarily unavailable.");
    } finally { setLoading(false); }
  }, [comparisons, normalized, timeframe]);

  useEffect(() => {
    if (!preferencesReady) return;
    queueMicrotask(() => { void load(); });
  }, [load, preferencesReady]);

  const addIndicator = () => {
    setIndicatorError("");
    if (indicatorNeedsPeriod(indicatorKind) && !validIndicatorPeriod(indicatorPeriod)) { setIndicatorError("Period must be a whole number from 2 to 250."); return; }
    if (!indicatorAvailable(indicatorKind, timeframe)) { setIndicatorError("VWAP is available only on verified intraday data."); return; }
    const period = indicatorNeedsPeriod(indicatorKind) ? indicatorPeriod : undefined;
    if (indicators.length >= 12) { setIndicatorError("Maximum 12 active studies."); return; }
    if (indicators.some((indicator) => indicator.kind === indicatorKind && indicator.period === period)) { setIndicatorError("This indicator configuration is already active."); return; }
    setIndicators((current) => [...current, { id: `${indicatorKind.toLowerCase()}-${period ?? "default"}-${Date.now()}`, kind: indicatorKind, period, color: INDICATOR_COLORS[current.length % INDICATOR_COLORS.length], enabled: true }]);
  };
  const updateIndicatorPeriod = (id: string, value: number) => {
    setIndicatorError("");
    if (!validIndicatorPeriod(value)) { setIndicatorError("Period must be a whole number from 2 to 250."); return; }
    const target = indicators.find((indicator) => indicator.id === id);
    if (!target) return;
    if (indicators.some((indicator) => indicator.id !== id && indicator.kind === target.kind && indicator.period === value)) { setIndicatorError("This indicator configuration is already active."); return; }
    setIndicators((current) => current.map((indicator) => indicator.id === id ? { ...indicator, period: value } : indicator));
  };
  const addComparison = () => {
    const next = compareInput.trim().toUpperCase();
    if (!/^(?:\^[A-Z0-9][A-Z0-9.-]{0,29}|[A-Z0-9][A-Z0-9.^=-]{0,30})$/.test(next) || next === normalized || comparisons.includes(next) || comparisons.length >= 3) return;
    setComparisons((current) => [...current, next]); setCompareInput("");
  };
  const resetPreferences = () => {
    setChartType("candlestick"); setTimeframe("1D"); setIndicators(DEFAULT_INDICATORS); setComparisons([]); setDrawings({}); setDrawingTool("cursor");
    localStorage.removeItem(storageKey(normalized));
    setResetArmed(false);
  };
  const requestFullscreen = async () => {
    setFullscreenError("");
    try {
      if (!shellRef.current?.requestFullscreen) throw new Error("UNSUPPORTED");
      await shellRef.current.requestFullscreen();
    } catch { setFullscreenError("Fullscreen is unavailable in this browser context."); }
  };
  const activeDrawings = drawings[timeframe] ?? [];
  const summary = dataset ? describeTechnical(dataset.data, indicators) : null;
  const freshness = dataset?.meta.freshnessType ?? (dataset?.data.isDelayed ? "DELAYED" : "UNAVAILABLE");

  return <div className="container-shell technical-workspace" ref={shellRef} data-testid="technical-chart-workspace">
    <header className="technical-page-heading">
      <div><span className="page-kicker">Technical analysis / technical-v1.0.0</span><h1>Technical chart</h1><p>Professional multi-pane OHLCV research. Indicators are descriptive calculations, not investment advice.</p></div>
      <div className="technical-source-card"><span className={`technical-freshness ${freshness.toLowerCase()}`}>{freshness}</span><strong>{dataset?.meta.provider ?? dataset?.data.source ?? "Provider pending"}</strong><small>{dataset?.data.asOf ? `Source timestamp ${new Date(dataset.data.asOf).toLocaleString()}` : "Timestamp unavailable"}</small><small>{dataset?.data.pricePolicy === "ADJUSTED_OHLC" ? "Corporate-action adjusted OHLC" : "Raw OHLC"}</small></div>
    </header>

    <section className="technical-toolbar" aria-label="Technical chart toolbar">
      <div className="technical-control-group" aria-label="Chart type">
        {([ ["candlestick", CandlestickChart, "Candles"], ["line", LineChart, "Line"], ["area", AreaChart, "Area"] ] as const).map(([value, Icon, label]) => <button key={value} className={chartType === value ? "active" : ""} onClick={() => setChartType(value)} aria-pressed={chartType === value}><Icon size={16}/>{label}</button>)}
      </div>
      <div className="technical-timeframes" aria-label="Timeframe">
        {TECHNICAL_TIMEFRAMES.map((value) => <button key={value} className={timeframe === value ? "active" : ""} onClick={() => setTimeframe(value)} aria-pressed={timeframe === value} title={value === "4h" ? "Calculated only from complete 1-hour bars" : undefined}>{value}</button>)}
      </div>
      <div className="technical-control-group" aria-label="Drawing tools">
        <button className={drawingTool === "cursor" ? "active" : ""} onClick={() => setDrawingTool("cursor")} aria-pressed={drawingTool === "cursor"}><MousePointer2 size={16}/>Pointer</button>
        <button className={drawingTool === "horizontal" ? "active" : ""} onClick={() => setDrawingTool("horizontal")} aria-pressed={drawingTool === "horizontal"}><Ruler size={16}/>Level</button>
        <button className={drawingTool === "trend" ? "active" : ""} onClick={() => setDrawingTool("trend")} aria-pressed={drawingTool === "trend"}><LineChart size={16}/>Trend</button>
      </div>
      <div className="technical-toolbar-actions">
        <button onClick={() => resetViewRef.current()}><RotateCcw size={16}/>View</button>
        <button onClick={() => void requestFullscreen()}><Expand size={16}/>Full screen</button>
      </div>
    </section>
    {fullscreenError && <div className="technical-control-message" role="status">{fullscreenError}</div>}

    <div className="technical-layout">
      <section className="technical-chart-card">
        <div className="technical-chart-title"><div><strong>{normalized} · {timeframe}</strong><span>{dataset?.data.bars.length ?? 0} verified bars · {chartType}</span></div><span>{drawingTool === "horizontal" ? "Click the chart to place a level" : drawingTool === "trend" ? "Click two points to draw a trend line" : "Scroll to zoom · drag to explore"}</span></div>
        {loading && !dataset && <div className="technical-empty" role="status" aria-busy="true"><BarChart3/><strong>Loading verified OHLCV…</strong><span>Connecting to the Kairo server data layer.</span></div>}
        {error && !dataset && <div className="technical-empty" role="alert"><strong>Technical chart unavailable</strong><span>{error}</span><button className="button-solid" onClick={() => void load(true)}>Retry</button></div>}
        {dataset && <TechnicalTerminalChart dataset={dataset.data} comparisons={comparisonData} chartType={chartType} indicators={indicators} drawings={activeDrawings} drawingTool={drawingTool} onCreateDrawing={(drawing) => setDrawings((current) => ({ ...current, [timeframe]: [...(current[timeframe] ?? []), drawing] }))} onResetView={(reset) => { resetViewRef.current = reset; }}/>} 
        {loading && dataset && <div className="technical-refreshing" role="status">Refreshing {timeframe}…</div>}
        {error && dataset && <div className="technical-inline-warning" role="status">Latest refresh failed. The last verified snapshot remains visible. <button onClick={() => void load(true)}>Retry</button></div>}
      </section>

      <aside className="technical-sidebar">
        <section><header><div><span>INDICATORS</span><strong>Active studies</strong></div><ChevronDown size={16}/></header>
          <div className="technical-indicator-builder"><select aria-label="Indicator type" value={indicatorKind} onChange={(event) => { setIndicatorKind(event.target.value as TechnicalIndicatorKind); setIndicatorError(""); }}>{(["SMA","EMA","BOLLINGER","RSI","MACD","ATR","VWAP","VOLUME"] as TechnicalIndicatorKind[]).map((kind) => <option key={kind}>{kind}</option>)}</select>{indicatorNeedsPeriod(indicatorKind) && <input aria-label="Indicator period" type="number" min="2" max="250" value={Number.isFinite(indicatorPeriod) ? indicatorPeriod : ""} onChange={(event) => setIndicatorPeriod(event.target.value === "" ? Number.NaN : Number(event.target.value))}/>}<button onClick={addIndicator} aria-label="Add indicator"><Plus size={16}/></button></div>
          {indicatorError && <p className="technical-indicator-error" role="alert">{indicatorError}</p>}
          <div className="technical-study-list">{indicators.map((indicator) => <div key={indicator.id}><button className="technical-study-toggle" aria-pressed={indicator.enabled} onClick={() => setIndicators((current) => current.map((item) => item.id === indicator.id ? { ...item, enabled: !item.enabled } : item))}><i style={{ background: indicator.color }}/><span>{indicator.kind}{indicator.period ? ` ${indicator.period}` : ""}</span><b>{indicatorAvailable(indicator.kind, timeframe) ? indicator.enabled ? "ON" : "OFF" : "N/A"}</b></button>{indicatorNeedsPeriod(indicator.kind) && <input className="technical-study-period" aria-label={`${indicator.kind} ${indicator.period} period`} type="number" min="2" max="250" value={indicator.period} onChange={(event) => updateIndicatorPeriod(indicator.id, Number(event.target.value))}/>}<button aria-label={`Remove ${indicator.kind} ${indicator.period ?? ""}`} onClick={() => setIndicators((current) => current.filter((item) => item.id !== indicator.id))}><Trash2 size={14}/></button></div>)}</div>
        </section>
        <section><header><div><span>COMPARE</span><strong>Rebased performance</strong></div><small>{comparisons.length}/3</small></header><div className="technical-compare"><input aria-label="Compare symbol" placeholder="SPY" value={compareInput} onChange={(event) => setCompareInput(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") addComparison(); }}/><button onClick={addComparison} disabled={comparisons.length >= 3}><Plus size={16}/></button></div><div className="technical-chips">{comparisons.map((comparison) => <button key={comparison} onClick={() => setComparisons((current) => current.filter((item) => item !== comparison))}>{comparison} ×</button>)}</div><p>Each comparison starts at 0%. Adding or changing a comparison requests its canonical dataset.</p></section>
        <section><header><div><span>DRAWINGS</span><strong>Local research marks</strong></div><small>{activeDrawings.length}</small></header>{activeDrawings.length ? <div className="technical-drawing-list">{activeDrawings.map((drawing, index) => <div key={drawing.id}><span>{drawing.type === "horizontal" ? `Level ${drawing.points[0].price.toFixed(2)}` : `Trend ${index + 1}`}</span><button aria-label={`Delete drawing ${index + 1}`} onClick={() => setDrawings((current) => ({ ...current, [timeframe]: activeDrawings.filter((item) => item.id !== drawing.id) }))}><Trash2 size={14}/></button></div>)}</div> : <p>No drawings saved for {timeframe}.</p>}<button className="technical-clear" disabled={!activeDrawings.length} onClick={() => setDrawings((current) => ({ ...current, [timeframe]: [] }))}><Eraser size={15}/>Clear timeframe</button></section>
      </aside>
    </div>

    {summary && <section className="technical-summary" aria-label="Technical summary"><article><span>TREND</span><strong>{summary.trend}</strong><p>Derived from price versus EMA 20 and EMA 50.</p></article><article><span>MOMENTUM</span><strong>{summary.momentum}</strong><p>Wilder RSI; a descriptive state, never a trade instruction.</p></article><article><span>VOLATILITY</span><strong>{summary.volatility}</strong><p>Wilder ATR normalized against the latest verified close.</p></article><article><span>DATA POLICY</span><strong>{dataset?.data.pricePolicy === "ADJUSTED_OHLC" ? "Adjusted daily history" : "Raw market history"}</strong><p>Incomplete, invalid and null bars are excluded rather than estimated.</p></article></section>}
    <footer className="technical-disclosure"><span>technical-v1.0.0 · deterministic formulas · no lookahead</span><button onClick={() => resetArmed ? resetPreferences() : setResetArmed(true)} aria-label={resetArmed ? "Confirm reset local workspace" : "Reset local workspace"}><RotateCcw size={14}/>{resetArmed ? "Confirm reset" : "Reset local workspace"}</button><p>Technical indicators summarize historical market data and do not predict future returns. Data may be delayed or unavailable.</p></footer>
  </div>;
}
