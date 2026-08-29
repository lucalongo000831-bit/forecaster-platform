"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AreaChart, BarChart3, CandlestickChart, ChevronDown, Eraser, Expand, Grid2X2, LineChart, Maximize2, Minimize2, MousePointer2, Plus, RotateCcw, Ruler, Save, Trash2 } from "lucide-react";
import type { ApiSuccess, TechnicalChartDataset, TechnicalChartResponse, TechnicalDrawing, TechnicalDrawingTool, TechnicalIndicatorConfig, TechnicalIndicatorKind, TechnicalLayout, TechnicalPanelState, TechnicalTemplate, TechnicalTimeframe, TechnicalWorkspaceV2 } from "@/types";
import { TECHNICAL_DRAWING_REGISTRY, TECHNICAL_TIMEFRAMES, calculateTechnicalConfluence, calculateTechnicalLevels, calculateVolumeProfile } from "@/engines/technical";
import { TechnicalTerminalChart } from "@/components/charts/technical/technical-terminal-chart";
import { applyTechnicalTemplate, BUILT_IN_TECHNICAL_TEMPLATES, createDefaultTechnicalWorkspace, MAX_CUSTOM_TECHNICAL_TEMPLATES, parseTechnicalWorkspace, sanitizeTechnicalNote, technicalDrawingKey, technicalV1StorageKey, technicalV2StorageKey, uniqueTechnicalDatasetRequests, updateLinkedTechnicalPanel } from "@/lib/technical-workspace-v2";

const INDICATOR_COLORS = ["#626ee8", "#20a4a8", "#f4a525", "#e05e72", "#18a879", "#9333ea"];
const memoryCache = new Map<string, TechnicalChartResponse>();
const inFlight = new Map<string, Promise<TechnicalChartResponse>>();

function indicatorNeedsPeriod(kind: TechnicalIndicatorKind) { return ["SMA", "EMA", "BOLLINGER", "RSI", "ATR"].includes(kind); }
function validIndicatorPeriod(value: number) { return Number.isInteger(value) && value >= 2 && value <= 250; }
function indicatorAvailable(kind: TechnicalIndicatorKind, timeframe: TechnicalTimeframe) { return kind !== "VWAP" || !["1D", "1W"].includes(timeframe); }
function panelCount(layout: TechnicalLayout) { return layout === "single" ? 1 : layout === "four-grid" ? 4 : 2; }
function datasetKey(symbol: string, timeframe: TechnicalTimeframe) { return `${symbol.toUpperCase()}:${timeframe}`; }

async function requestDataset(symbol: string, timeframe: TechnicalTimeframe, force = false): Promise<TechnicalChartResponse> {
  const key = datasetKey(symbol, timeframe);
  if (!force && memoryCache.has(key)) return memoryCache.get(key)!;
  if (!force && inFlight.has(key)) return inFlight.get(key)!;
  const operation = (async () => {
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
  })();
  inFlight.set(key, operation);
  try { return await operation; } finally { if (inFlight.get(key) === operation) inFlight.delete(key); }
}

function clonePanel(panel: TechnicalPanelState, id: string, timeframe = panel.timeframe): TechnicalPanelState {
  return { ...panel, id, timeframe, indicators: panel.indicators.map((indicator) => ({ ...indicator })), comparisons: [...panel.comparisons] };
}

function drawingLabel(drawing: TechnicalDrawing, index: number) {
  if (drawing.type === "horizontal") return `Level ${drawing.points[0].price.toFixed(2)}`;
  if (drawing.type === "text") return drawing.text ?? `Note ${index + 1}`;
  return `${TECHNICAL_DRAWING_REGISTRY.find((definition) => definition.id === drawing.type)?.label ?? drawing.type} ${index + 1}`;
}

export function TechnicalChartWorkspace({ symbol }: { symbol: string }) {
  const normalized = symbol.toUpperCase();
  const shellRef = useRef<HTMLDivElement>(null);
  const resetViewRefs = useRef<Record<string, () => void>>({});
  const [workspace, setWorkspace] = useState<TechnicalWorkspaceV2>(() => createDefaultTechnicalWorkspace(normalized));
  const [datasets, setDatasets] = useState<Record<string, TechnicalChartResponse>>({});
  const [loadingKeys, setLoadingKeys] = useState<string[]>([]);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [drawingTool, setDrawingTool] = useState<TechnicalDrawingTool>("cursor");
  const [drawingText, setDrawingText] = useState("Research note");
  const [selectedDrawingId, setSelectedDrawingId] = useState<string | null>(null);
  const [linkedCrosshair, setLinkedCrosshair] = useState<{ sourcePanelId: string; timestamp: string | null } | null>(null);
  const [maximizedPanelId, setMaximizedPanelId] = useState<string | null>(null);
  const [indicatorKind, setIndicatorKind] = useState<TechnicalIndicatorKind>("SMA");
  const [indicatorPeriod, setIndicatorPeriod] = useState(20);
  const [indicatorError, setIndicatorError] = useState("");
  const [compareInput, setCompareInput] = useState("");
  const [templateName, setTemplateName] = useState("");
  const [templateMessage, setTemplateMessage] = useState("");
  const [fullscreenError, setFullscreenError] = useState("");
  const [resetArmed, setResetArmed] = useState(false);
  const [preferencesReady, setPreferencesReady] = useState(false);
  const [alertCondition, setAlertCondition] = useState("Price crosses horizontal level");

  useEffect(() => {
    queueMicrotask(() => {
      try {
        const v2Raw = localStorage.getItem(technicalV2StorageKey(normalized));
        const v1Raw = localStorage.getItem(technicalV1StorageKey(normalized));
        setWorkspace(parseTechnicalWorkspace(normalized, v2Raw ? JSON.parse(v2Raw) : null, v1Raw ? JSON.parse(v1Raw) : null));
      } catch {
        setWorkspace(createDefaultTechnicalWorkspace(normalized));
      }
      setPreferencesReady(true);
    });
  }, [normalized]);

  useEffect(() => {
    if (!preferencesReady) return;
    localStorage.setItem(technicalV2StorageKey(normalized), JSON.stringify(workspace));
  }, [normalized, preferencesReady, workspace]);

  const visiblePanels = useMemo(() => maximizedPanelId ? workspace.panels.filter((panel) => panel.id === maximizedPanelId) : workspace.panels.slice(0, panelCount(workspace.layout)), [maximizedPanelId, workspace.layout, workspace.panels]);
  const activePanel = workspace.panels.find((panel) => panel.id === workspace.activePanelId) ?? workspace.panels[0];
  const activeDataset = datasets[datasetKey(activePanel.symbol, activePanel.timeframe)] ?? null;
  const activeDrawingKey = technicalDrawingKey(activePanel.symbol, activePanel.timeframe);
  const activeDrawings = workspace.drawings[activeDrawingKey] ?? [];
  const activeLevels = useMemo(() => activeDataset && workspace.features.autoSupportResistance ? calculateTechnicalLevels(activeDataset.data.bars) : [], [activeDataset, workspace.features.autoSupportResistance]);
  const activeProfile = useMemo(() => activeDataset ? calculateVolumeProfile(activeDataset.data.bars) : calculateVolumeProfile([]), [activeDataset]);
  const confluence = useMemo(() => activeDataset ? calculateTechnicalConfluence(activeDataset.data.bars, activeLevels, activeProfile) : null, [activeDataset, activeLevels, activeProfile]);

  const loadKeys = useMemo(() => {
    return uniqueTechnicalDatasetRequests(visiblePanels);
  }, [visiblePanels]);

  const load = useCallback(async (force = false) => {
    const keys = loadKeys.map(({ symbol: loadSymbol, timeframe }) => datasetKey(loadSymbol, timeframe));
    setLoadingKeys((current) => [...new Set([...current, ...keys])]);
    const results = await Promise.all(loadKeys.map(async ({ symbol: loadSymbol, timeframe }) => {
      const key = datasetKey(loadSymbol, timeframe);
      try { return { key, response: await requestDataset(loadSymbol, timeframe, force), error: "" }; }
      catch (error) { return { key, response: null, error: error instanceof Error ? error.message : "Technical data temporarily unavailable." }; }
    }));
    setDatasets((current) => ({ ...current, ...Object.fromEntries(results.flatMap((result) => result.response ? [[result.key, result.response]] : [])) }));
    setErrors((current) => ({ ...current, ...Object.fromEntries(results.map((result) => [result.key, result.error])) }));
    setLoadingKeys((current) => current.filter((key) => !keys.includes(key)));
  }, [loadKeys]);

  useEffect(() => { if (preferencesReady) queueMicrotask(() => { void load(); }); }, [load, preferencesReady]);

  const updateWorkspacePanel = useCallback((panelId: string, patch: Partial<TechnicalPanelState>) => {
    setWorkspace((current) => updateLinkedTechnicalPanel(current, panelId, patch));
  }, []);

  const changeLayout = (layout: TechnicalLayout) => setWorkspace((current) => {
    const count = panelCount(layout);
    const source = current.panels.find((panel) => panel.id === current.activePanelId) ?? current.panels[0];
    const presets: TechnicalTimeframe[] = [source.timeframe, "4h", "1h", "15m"];
    const panels = Array.from({ length: count }, (_, index) => current.panels[index] ?? clonePanel(source, `panel-${index + 1}`, presets[index]));
    return { ...current, layout, panels, activePanelId: panels.some((panel) => panel.id === current.activePanelId) ? current.activePanelId : panels[0].id };
  });

  const updateActiveIndicators = (updater: (current: TechnicalIndicatorConfig[]) => TechnicalIndicatorConfig[]) => updateWorkspacePanel(activePanel.id, { indicators: updater(activePanel.indicators) });
  const addIndicator = () => {
    setIndicatorError("");
    if (indicatorNeedsPeriod(indicatorKind) && !validIndicatorPeriod(indicatorPeriod)) { setIndicatorError("Period must be a whole number from 2 to 250."); return; }
    if (!indicatorAvailable(indicatorKind, activePanel.timeframe)) { setIndicatorError("VWAP is available only on verified intraday data."); return; }
    const period = indicatorNeedsPeriod(indicatorKind) ? indicatorPeriod : undefined;
    if (activePanel.indicators.length >= 12) { setIndicatorError("Maximum 12 active studies."); return; }
    if (activePanel.indicators.some((indicator) => indicator.kind === indicatorKind && indicator.period === period)) { setIndicatorError("This indicator configuration is already active."); return; }
    updateActiveIndicators((current) => [...current, { id: `${indicatorKind.toLowerCase()}-${period ?? "default"}-${Date.now()}`, kind: indicatorKind, period, color: INDICATOR_COLORS[current.length % INDICATOR_COLORS.length], enabled: true }]);
  };
  const updateIndicatorPeriod = (id: string, value: number) => {
    setIndicatorError("");
    if (!validIndicatorPeriod(value)) { setIndicatorError("Period must be a whole number from 2 to 250."); return; }
    const target = activePanel.indicators.find((indicator) => indicator.id === id);
    if (!target) return;
    if (activePanel.indicators.some((indicator) => indicator.id !== id && indicator.kind === target.kind && indicator.period === value)) { setIndicatorError("This indicator configuration is already active."); return; }
    updateActiveIndicators((current) => current.map((indicator) => indicator.id === id ? { ...indicator, period: value } : indicator));
  };
  const addComparison = () => {
    const next = compareInput.trim().toUpperCase();
    if (!/^(?:\^[A-Z0-9][A-Z0-9.-]{0,29}|[A-Z0-9][A-Z0-9.^=-]{0,30})$/.test(next) || next === activePanel.symbol || activePanel.comparisons.includes(next) || activePanel.comparisons.length >= 3) return;
    updateWorkspacePanel(activePanel.id, { comparisons: [...activePanel.comparisons, next] });
    setCompareInput("");
  };
  const setActiveDrawings = (updater: (current: TechnicalDrawing[]) => TechnicalDrawing[]) => setWorkspace((current) => ({ ...current, drawings: { ...current.drawings, [activeDrawingKey]: updater(current.drawings[activeDrawingKey] ?? []).slice(-100) } }));
  const applyTemplate = (template: TechnicalTemplate) => { setWorkspace((current) => applyTechnicalTemplate(current, template)); setTemplateMessage(`${template.name} template applied.`); };
  const saveTemplate = () => {
    const name = sanitizeTechnicalNote(templateName).slice(0, 40);
    if (!name) { setTemplateMessage("Enter a template name."); return; }
    if (workspace.customTemplates.length >= MAX_CUSTOM_TECHNICAL_TEMPLATES) { setTemplateMessage("Maximum 20 custom templates."); return; }
    const template: TechnicalTemplate = { id: `custom-${crypto.randomUUID()}`, name, builtIn: false, layout: workspace.layout, panels: workspace.panels.map(({ timeframe, chartType, indicators }) => ({ timeframe, chartType, indicators: indicators.map((item) => ({ ...item })) })), links: { ...workspace.links }, features: { ...workspace.features } };
    setWorkspace((current) => ({ ...current, customTemplates: [...current.customTemplates, template] }));
    setTemplateName(""); setTemplateMessage(`${name} saved locally.`);
  };
  const resetPreferences = () => { const next = createDefaultTechnicalWorkspace(normalized); setWorkspace(next); setDrawingTool("cursor"); localStorage.removeItem(technicalV2StorageKey(normalized)); setResetArmed(false); };
  const requestFullscreen = async () => { setFullscreenError(""); try { if (!shellRef.current?.requestFullscreen) throw new Error("UNSUPPORTED"); await shellRef.current.requestFullscreen(); } catch { setFullscreenError("Fullscreen is unavailable in this browser context."); } };

  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      const tag = (event.target as HTMLElement | null)?.tagName;
      if (["INPUT", "SELECT", "TEXTAREA"].includes(tag ?? "")) return;
      if (event.key === "Escape") setDrawingTool("cursor");
      if (event.key.toLowerCase() === "r") resetViewRefs.current[activePanel.id]?.();
      if (event.key === "Delete" && selectedDrawingId) setActiveDrawings((current) => current.filter((drawing) => drawing.id !== selectedDrawingId));
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  });

  const freshness = activeDataset?.meta.freshnessType ?? (activeDataset?.data.isDelayed ? "DELAYED" : "UNAVAILABLE");
  const drawingInstruction = drawingTool === "cursor" ? "Scroll to zoom · drag to explore" : `${TECHNICAL_DRAWING_REGISTRY.find((item) => item.id === drawingTool)?.description ?? "Select chart anchors"}`;

  return <div className="container-shell technical-workspace technical-workspace-v2" ref={shellRef} data-testid="technical-chart-workspace">
    <header className="technical-page-heading">
      <div><span className="page-kicker">Technical analysis / technical-v2.0.0</span><h1>Technical chart</h1><p>Advanced multi-chart OHLCV research. Derived studies are descriptive calculations, not investment advice.</p></div>
      <div className="technical-source-card"><span className={`technical-freshness ${freshness.toLowerCase()}`}>{freshness}</span><strong>{activeDataset?.meta.provider ?? activeDataset?.data.source ?? "Provider pending"}</strong><small>{activeDataset?.data.asOf ? `Source timestamp ${new Date(activeDataset.data.asOf).toLocaleString()}` : "Timestamp unavailable"}</small><small>{activeDataset?.data.pricePolicy === "ADJUSTED_OHLC" ? "Corporate-action adjusted OHLC" : "Raw OHLC"}</small></div>
    </header>

    <section className="technical-toolbar" aria-label="Technical chart toolbar">
      <div className="technical-control-group" aria-label="Chart type">
        {([ ["candlestick", CandlestickChart, "Candles"], ["heikin-ashi", CandlestickChart, "Heikin Ashi"], ["line", LineChart, "Line"], ["area", AreaChart, "Area"] ] as const).map(([value, Icon, label]) => <button key={value} className={activePanel.chartType === value ? "active" : ""} onClick={() => updateWorkspacePanel(activePanel.id, { chartType: value })} aria-pressed={activePanel.chartType === value}><Icon size={16}/>{label}</button>)}
      </div>
      <div className="technical-timeframes" aria-label="Timeframe">{TECHNICAL_TIMEFRAMES.map((value) => <button key={value} className={activePanel.timeframe === value ? "active" : ""} onClick={() => updateWorkspacePanel(activePanel.id, { timeframe: value })} aria-pressed={activePanel.timeframe === value}>{value}</button>)}</div>
      <div className="technical-layout-controls" aria-label="Chart layout">{([ ["single", "1"], ["two-vertical", "2V"], ["two-horizontal", "2H"], ["four-grid", "4"] ] as const).map(([layout, label]) => <button key={layout} className={workspace.layout === layout ? "active" : ""} aria-label={`${label} chart layout`} aria-pressed={workspace.layout === layout} onClick={() => changeLayout(layout)}><Grid2X2 size={14}/>{label}</button>)}</div>
      <div className="technical-toolbar-actions"><button onClick={() => resetViewRefs.current[activePanel.id]?.()}><RotateCcw size={16}/>View</button><button onClick={() => void requestFullscreen()}><Expand size={16}/>Full screen</button></div>
    </section>
    {fullscreenError && <div className="technical-control-message" role="status">{fullscreenError}</div>}

    <section className="technical-v2-featurebar" aria-label="Technical V2 features">
      <label><input type="checkbox" checked={workspace.features.autoSupportResistance} onChange={(event) => setWorkspace((current) => ({ ...current, features: { ...current.features, autoSupportResistance: event.target.checked } }))}/>Auto S/R</label>
      <label><input type="checkbox" checked={workspace.features.volumeProfile} onChange={(event) => setWorkspace((current) => ({ ...current, features: { ...current.features, volumeProfile: event.target.checked } }))}/>Volume Profile</label>
      <label><input type="checkbox" checked={workspace.features.confluence} onChange={(event) => setWorkspace((current) => ({ ...current, features: { ...current.features, confluence: event.target.checked } }))}/>Confluence</label>
      <label><input type="checkbox" checked={workspace.links.crosshair} onChange={(event) => setWorkspace((current) => ({ ...current, links: { ...current.links, crosshair: event.target.checked } }))}/>Link crosshair</label>
      <label><input type="checkbox" checked={workspace.links.symbol} onChange={(event) => setWorkspace((current) => ({ ...current, links: { ...current.links, symbol: event.target.checked } }))}/>Link symbol</label>
      <label><input type="checkbox" checked={workspace.links.timeframe} onChange={(event) => setWorkspace((current) => ({ ...current, links: { ...current.links, timeframe: event.target.checked } }))}/>Link timeframe</label>
    </section>

    <section className="technical-drawing-toolbar" aria-label="Advanced drawing tools">
      <button className={drawingTool === "cursor" ? "active" : ""} onClick={() => setDrawingTool("cursor")} aria-pressed={drawingTool === "cursor"}><MousePointer2 size={15}/>Pointer</button>
      {TECHNICAL_DRAWING_REGISTRY.map((definition) => <button key={definition.id} className={drawingTool === definition.id ? "active" : ""} onClick={() => setDrawingTool(definition.id)} aria-pressed={drawingTool === definition.id} title={definition.description}><Ruler size={14}/>{definition.id === "horizontal" ? "Level" : definition.id === "trend" ? "Trend" : definition.label}</button>)}
      {drawingTool === "text" && <input aria-label="Drawing note" maxLength={120} value={drawingText} onChange={(event) => setDrawingText(sanitizeTechnicalNote(event.target.value))}/>}
    </section>

    <div className="technical-layout technical-layout-v2">
      <section className={`technical-chart-grid layout-${workspace.layout} ${maximizedPanelId ? "is-maximized" : ""}`} aria-label="Multi-chart workspace">
        {visiblePanels.map((panel) => {
          const key = datasetKey(panel.symbol, panel.timeframe);
          const response = datasets[key];
          const comparisons = panel.comparisons.flatMap((comparison) => datasets[datasetKey(comparison, panel.timeframe)]?.data ?? []);
          const panelDrawings = workspace.drawings[technicalDrawingKey(panel.symbol, panel.timeframe)] ?? [];
          const levels = response && workspace.features.autoSupportResistance ? calculateTechnicalLevels(response.data.bars) : [];
          return <article key={panel.id} className={`technical-chart-card technical-panel ${workspace.activePanelId === panel.id ? "active" : ""}`} onPointerDown={() => setWorkspace((current) => current.activePanelId === panel.id ? current : { ...current, activePanelId: panel.id })} data-panel-id={panel.id}>
            <div className="technical-chart-title technical-panel-header"><div><strong>{panel.symbol} · {panel.timeframe}</strong><span>{response?.data.bars.length ?? 0} verified bars · {panel.chartType}</span></div><div><span>{workspace.links.crosshair ? "CROSSHAIR LINKED" : "ISOLATED"}</span><button aria-label={`${maximizedPanelId ? "Restore" : "Maximize"} ${panel.symbol} panel`} onClick={(event) => { event.stopPropagation(); setMaximizedPanelId((current) => current === panel.id ? null : panel.id); }}>{maximizedPanelId === panel.id ? <Minimize2 size={15}/> : <Maximize2 size={15}/>}</button></div></div>
            {loadingKeys.includes(key) && !response && <div className="technical-empty" role="status" aria-busy="true"><BarChart3/><strong>Loading verified OHLCV…</strong><span>Connecting to the Kairo server data layer.</span></div>}
            {errors[key] && !response && <div className="technical-empty" role="alert"><strong>Technical chart unavailable</strong><span>{errors[key]}</span><button className="button-solid" onClick={() => void load(true)}>Retry</button></div>}
            {response && <TechnicalTerminalChart
              dataset={response.data}
              comparisons={comparisons}
              chartType={panel.chartType}
              indicators={panel.indicators}
              drawings={panelDrawings}
              drawingTool={workspace.activePanelId === panel.id ? drawingTool : "cursor"}
              drawingText={drawingText}
              selectedDrawingId={workspace.activePanelId === panel.id ? selectedDrawingId : null}
              autoLevels={levels}
              showVolumeProfile={workspace.features.volumeProfile}
              panelId={panel.id}
              linkedCrosshair={workspace.links.crosshair ? linkedCrosshair : null}
              onCrosshairTime={(sourcePanelId, timestamp) => { if (workspace.links.crosshair) setLinkedCrosshair({ sourcePanelId, timestamp }); }}
              onCreateDrawing={(drawing) => {
                const drawingKey = technicalDrawingKey(panel.symbol, panel.timeframe);
                setWorkspace((current) => ({ ...current, drawings: { ...current.drawings, [drawingKey]: [...(current.drawings[drawingKey] ?? []), drawing].slice(-100) } }));
                setSelectedDrawingId(drawing.id);
              }}
              onResetView={(reset) => { resetViewRefs.current[panel.id] = reset; }}
            />}
            {loadingKeys.includes(key) && response && <div className="technical-refreshing" role="status">Refreshing {panel.timeframe}…</div>}
            {errors[key] && response && <div className="technical-inline-warning" role="status">Latest refresh failed. Last verified snapshot remains visible.</div>}
          </article>;
        })}
      </section>

      <aside className="technical-sidebar">
        <section><header><div><span>ACTIVE PANEL</span><strong>Configuration</strong></div><ChevronDown size={16}/></header><div className="technical-panel-fields"><input aria-label="Panel symbol" value={activePanel.symbol} onChange={(event) => updateWorkspacePanel(activePanel.id, { symbol: event.target.value.toUpperCase().replace(/[^A-Z0-9.^=-]/g, "").slice(0, 31) })}/><select aria-label="Panel timeframe" value={activePanel.timeframe} onChange={(event) => updateWorkspacePanel(activePanel.id, { timeframe: event.target.value as TechnicalTimeframe })}>{TECHNICAL_TIMEFRAMES.map((value) => <option key={value}>{value}</option>)}</select></div></section>
        <section><header><div><span>INDICATORS</span><strong>Active studies</strong></div><small>{activePanel.indicators.length}/12</small></header><div className="technical-indicator-builder"><select aria-label="Indicator type" value={indicatorKind} onChange={(event) => { setIndicatorKind(event.target.value as TechnicalIndicatorKind); setIndicatorError(""); }}>{(["SMA","EMA","BOLLINGER","RSI","MACD","ATR","VWAP","VOLUME"] as TechnicalIndicatorKind[]).map((kind) => <option key={kind}>{kind}</option>)}</select>{indicatorNeedsPeriod(indicatorKind) && <input aria-label="Indicator period" type="number" min="2" max="250" value={Number.isFinite(indicatorPeriod) ? indicatorPeriod : ""} onChange={(event) => setIndicatorPeriod(event.target.value === "" ? Number.NaN : Number(event.target.value))}/>}<button onClick={addIndicator} aria-label="Add indicator"><Plus size={16}/></button></div>{indicatorError && <p className="technical-indicator-error" role="alert">{indicatorError}</p>}<div className="technical-study-list">{activePanel.indicators.map((indicator) => <div key={indicator.id}><button className="technical-study-toggle" aria-pressed={indicator.enabled} onClick={() => updateActiveIndicators((current) => current.map((item) => item.id === indicator.id ? { ...item, enabled: !item.enabled } : item))}><i style={{ background: indicator.color }}/><span>{indicator.kind}{indicator.period ? ` ${indicator.period}` : ""}</span><b>{indicatorAvailable(indicator.kind, activePanel.timeframe) ? indicator.enabled ? "ON" : "OFF" : "N/A"}</b></button>{indicatorNeedsPeriod(indicator.kind) && <input className="technical-study-period" aria-label={`${indicator.kind} ${indicator.period} period`} type="number" min="2" max="250" value={indicator.period} onChange={(event) => updateIndicatorPeriod(indicator.id, Number(event.target.value))}/>}<button aria-label={`Remove ${indicator.kind} ${indicator.period ?? ""}`} onClick={() => updateActiveIndicators((current) => current.filter((item) => item.id !== indicator.id))}><Trash2 size={14}/></button></div>)}</div></section>
        <section><header><div><span>COMPARE</span><strong>Rebased performance</strong></div><small>{activePanel.comparisons.length}/3</small></header><div className="technical-compare"><input aria-label="Compare symbol" placeholder="SPY" value={compareInput} onChange={(event) => setCompareInput(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") addComparison(); }}/><button aria-label="Add comparison" onClick={addComparison} disabled={activePanel.comparisons.length >= 3}><Plus size={16}/></button></div><div className="technical-chips">{activePanel.comparisons.map((comparison) => <button key={comparison} onClick={() => updateWorkspacePanel(activePanel.id, { comparisons: activePanel.comparisons.filter((item) => item !== comparison) })}>{comparison} ×</button>)}</div><p>Comparisons are rebased to 0%. Identical panel requests share one in-flight operation.</p></section>
        <section><header><div><span>DRAWINGS</span><strong>Symbol + timeframe</strong></div><small>{activeDrawings.length}</small></header>{activeDrawings.length ? <div className="technical-drawing-list">{activeDrawings.map((drawing, index) => <div key={drawing.id} className={selectedDrawingId === drawing.id ? "selected" : ""}><button onClick={() => setSelectedDrawingId(drawing.id)}>{drawingLabel(drawing, index)}</button><button aria-label={`Toggle drawing ${index + 1}`} onClick={() => setActiveDrawings((current) => current.map((item) => item.id === drawing.id ? { ...item, visible: !item.visible } : item))}>{drawing.visible ? "ON" : "OFF"}</button><button aria-label={`Delete drawing ${index + 1}`} onClick={() => setActiveDrawings((current) => current.filter((item) => item.id !== drawing.id))}><Trash2 size={14}/></button></div>)}</div> : <p>No drawings saved for {activePanel.timeframe}.</p>}<button className="technical-clear" disabled={!activeDrawings.length} onClick={() => setActiveDrawings(() => [])}><Eraser size={15}/>Clear timeframe</button></section>
        <section><header><div><span>TEMPLATES</span><strong>Workspace presets</strong></div><small>{workspace.customTemplates.length}/20</small></header><div className="technical-template-grid">{[...BUILT_IN_TECHNICAL_TEMPLATES, ...workspace.customTemplates].map((template) => <button key={template.id} aria-label={`Apply ${template.name} template`} onClick={() => applyTemplate(template)}>{template.name}</button>)}</div><div className="technical-template-save"><input aria-label="Template name" placeholder="My setup" value={templateName} onChange={(event) => setTemplateName(event.target.value)}/><button aria-label="Save custom template" onClick={saveTemplate}><Save size={15}/></button></div>{templateMessage && <p role="status">{templateMessage}</p>}</section>
        <section><header><div><span>ALERT DEFINITION</span><strong>Condition builder</strong></div></header><select aria-label="Technical alert condition" value={alertCondition} onChange={(event) => setAlertCondition(event.target.value)}>{["Price crosses horizontal level","Price enters support zone","Price enters resistance zone","RSI crosses 70","RSI crosses 30","MACD crosses signal","Price crosses EMA","Price crosses Anchored VWAP"].map((value) => <option key={value}>{value}</option>)}</select><button className="technical-clear" disabled>Activate monitoring</button><p>Monitoring unavailable. This definition is local and does not imply background alerts.</p></section>
      </aside>
    </div>

    {workspace.features.confluence && confluence && <section className="technical-summary" aria-label="Technical confluence summary"><article><span>TREND</span><strong>{confluence.trend}</strong><p>{confluence.reasons[0] ?? "Insufficient verified history."}</p></article><article><span>MOMENTUM</span><strong>{confluence.momentum}</strong><p>{confluence.reasons[1] ?? "Momentum input unavailable."}</p></article><article><span>VOLATILITY</span><strong>{confluence.volatility}</strong><p>{confluence.reasons[2] ?? "Volatility input unavailable."}</p></article><article><span>STRUCTURE</span><strong>{confluence.status}</strong><p>{confluence.structure}</p></article><article><span>VOLUME</span><strong>{confluence.alignment} alignment</strong><p>{confluence.volume}</p></article></section>}
    {workspace.features.autoSupportResistance && <section className="technical-levels-summary" aria-label="Automatic support and resistance details">{activeLevels.length ? activeLevels.map((level) => <article key={level.id}><strong>{level.type} · {level.centerPrice.toFixed(2)}</strong><span>Score {level.score}/100 · {level.touches} touches · {level.status}</span><small>{Math.abs(level.distancePct).toFixed(2)}% from current price · last test {new Date(level.lastTouch).toLocaleDateString()}</small></article>) : <p>Auto S/R unavailable: INSUFFICIENT_HISTORY or no qualified levels.</p>}</section>}
    <footer className="technical-disclosure"><span>technical-v2.0.0 · deterministic formulas · no lookahead</span><button onClick={() => resetArmed ? resetPreferences() : setResetArmed(true)} aria-label={resetArmed ? "Confirm reset local workspace" : "Reset local workspace"}><RotateCcw size={14}/>{resetArmed ? "Confirm reset" : "Reset local workspace"}</button><p>{drawingInstruction}. Heikin Ashi is derived; indicators use real OHLC. Volume profile is an estimated uniform allocation from bar OHLCV, not tick-accurate exchange volume-at-price.</p></footer>
  </div>;
}
