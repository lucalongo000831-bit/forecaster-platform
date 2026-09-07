"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AreaChart, BarChart3, CandlestickChart, ChevronDown, Eraser, Expand, Grid2X2, LineChart, Maximize2, Minimize2, MousePointer2, Plus, RotateCcw, Ruler, Save, Trash2 } from "lucide-react";
import type { ApiSuccess, MtfTechnicalLevel, RangedVolumeProfileResult, TechnicalChartDataset, TechnicalChartResponse, TechnicalDrawing, TechnicalDrawingTool, TechnicalIndicatorConfig, TechnicalIndicatorKind, TechnicalLayout, TechnicalPanelState, TechnicalTemplateV3, TechnicalTimeframe, TechnicalWorkspaceV3 } from "@/types";
import { TECHNICAL_ALERT_CONDITIONS, TECHNICAL_ALERT_REGISTRY, TECHNICAL_DRAWING_REGISTRY, TECHNICAL_TIMEFRAMES, calculateAnchoredVolumeProfile, calculateFixedRangeVolumeProfile, calculateMarketStructure, calculateMtfStructure, calculateMtfTechnicalLevels, calculateSessionAnalytics, calculateTechnicalConfluenceV2, calculateTechnicalDivergences, calculateTechnicalLevels, calculateVolumeProfile, type TechnicalAlertConditionId } from "@/engines/technical";
import { TechnicalTerminalChart } from "@/components/charts/technical/technical-terminal-chart";
import { MAX_CUSTOM_TECHNICAL_TEMPLATES, sanitizeTechnicalNote, technicalDrawingKey, technicalV1StorageKey, technicalV2StorageKey, uniqueTechnicalDatasetRequests } from "@/lib/technical-workspace-v2";
import { applyTechnicalTemplateV3, BUILT_IN_TECHNICAL_TEMPLATES_V3, createDefaultTechnicalWorkspaceV3, MAX_TECHNICAL_PROFILES_PER_DATASET, parseTechnicalWorkspaceV3, technicalV3StorageKey } from "@/lib/technical-workspace-v3";

const INDICATOR_COLORS = ["#626ee8", "#20a4a8", "#f4a525", "#e05e72", "#18a879", "#9333ea"];
const EMPTY_MTF_LEVELS: MtfTechnicalLevel[] = [];
const EMPTY_RANGED_PROFILES: Array<RangedVolumeProfileResult & { id: string }> = [];
const memoryCache = new Map<string, TechnicalChartResponse>();
const inFlight = new Map<string, Promise<TechnicalChartResponse>>();

function indicatorNeedsPeriod(kind: TechnicalIndicatorKind) { return ["SMA", "EMA", "BOLLINGER", "RSI", "ATR"].includes(kind); }
function validIndicatorPeriod(value: number) { return Number.isInteger(value) && value >= 2 && value <= 250; }
function indicatorAvailable(kind: TechnicalIndicatorKind, timeframe: TechnicalTimeframe) { return kind !== "VWAP" || !["1D", "1W"].includes(timeframe); }
function panelCount(layout: TechnicalLayout) { return layout === "single" ? 1 : layout === "four-grid" ? 4 : 2; }
function datasetKey(symbol: string, timeframe: TechnicalTimeframe) { return `${symbol.toUpperCase()}:${timeframe}`; }
function exchangeTimeZone(exchange: string) { const value = exchange.toUpperCase(); return value.includes("MIL") || value.includes("MTA") ? "Europe/Rome" : value.includes("LSE") || value.includes("LONDON") ? "Europe/London" : value.includes("TOK") ? "Asia/Tokyo" : "America/New_York"; }

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
  const [workspace, setWorkspace] = useState<TechnicalWorkspaceV3>(() => createDefaultTechnicalWorkspaceV3(normalized));
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
  const [alertCondition, setAlertCondition] = useState<TechnicalAlertConditionId>("TECH_PRICE_CROSS_LEVEL");
  const [alertValue, setAlertValue] = useState(70);
  const [alertMessage, setAlertMessage] = useState("");
  const [alertBusy, setAlertBusy] = useState(false);
  const [profileStart, setProfileStart] = useState("");
  const [profileEnd, setProfileEnd] = useState("");
  const [profileBins, setProfileBins] = useState(24);
  const [profileValueArea, setProfileValueArea] = useState(70);
  const handleCrosshairTime = useCallback((sourcePanelId: string, timestamp: string | null) => {
    if (!workspace.links.crosshair) return;
    setLinkedCrosshair((current) => current?.sourcePanelId === sourcePanelId && current.timestamp === timestamp ? current : { sourcePanelId, timestamp });
  }, [workspace.links.crosshair]);

  useEffect(() => {
    queueMicrotask(() => {
      try {
        const v3Raw = localStorage.getItem(technicalV3StorageKey(normalized));
        const v2Raw = localStorage.getItem(technicalV2StorageKey(normalized));
        const v1Raw = localStorage.getItem(technicalV1StorageKey(normalized));
        setWorkspace(parseTechnicalWorkspaceV3(normalized, v3Raw ? JSON.parse(v3Raw) : null, v2Raw ? JSON.parse(v2Raw) : null, v1Raw ? JSON.parse(v1Raw) : null));
      } catch {
        setWorkspace(createDefaultTechnicalWorkspaceV3(normalized));
      }
      setPreferencesReady(true);
    });
  }, [normalized]);

  useEffect(() => {
    if (!preferencesReady) return;
    localStorage.setItem(technicalV3StorageKey(normalized), JSON.stringify(workspace));
  }, [normalized, preferencesReady, workspace]);

  const visiblePanels = useMemo(() => maximizedPanelId ? workspace.panels.filter((panel) => panel.id === maximizedPanelId) : workspace.panels.slice(0, panelCount(workspace.layout)), [maximizedPanelId, workspace.layout, workspace.panels]);
  const activePanel = workspace.panels.find((panel) => panel.id === workspace.activePanelId) ?? workspace.panels[0];
  const activeDataset = datasets[datasetKey(activePanel.symbol, activePanel.timeframe)] ?? null;
  const activeDrawingKey = technicalDrawingKey(activePanel.symbol, activePanel.timeframe);
  const activeDrawings = workspace.drawings[activeDrawingKey] ?? [];
  const activeProfileDefinitions = useMemo(() => workspace.profiles[activeDrawingKey] ?? [], [activeDrawingKey, workspace.profiles]);
  const activeLevels = useMemo(() => activeDataset && workspace.features.autoSupportResistance ? calculateTechnicalLevels(activeDataset.data.bars) : [], [activeDataset, workspace.features.autoSupportResistance]);
  const activeProfile = useMemo(() => activeDataset ? calculateVolumeProfile(activeDataset.data.bars) : calculateVolumeProfile([]), [activeDataset]);
  const activeStructure = useMemo(() => activeDataset ? calculateMarketStructure(activeDataset.data.bars) : null, [activeDataset]);
  const activeDivergences = useMemo(() => activeDataset ? calculateTechnicalDivergences(activeDataset.data.bars) : null, [activeDataset]);
  const mtfDatasets = useMemo(() => Object.fromEntries((["15m", "1h", "4h", "1D"] as TechnicalTimeframe[]).flatMap((timeframe) => { const data = datasets[datasetKey(activePanel.symbol, timeframe)]?.data.bars; return data ? [[timeframe, data]] : []; })), [activePanel.symbol, datasets]);
  const mtfStructure = useMemo(() => calculateMtfStructure(mtfDatasets), [mtfDatasets]);
  const mtfLevels = useMemo(() => calculateMtfTechnicalLevels(mtfDatasets), [mtfDatasets]);
  const sessionAnalytics = useMemo(() => activeDataset ? calculateSessionAnalytics(activeDataset.data.bars, { timeframe: activePanel.timeframe, assetClass: activePanel.symbol.endsWith("-USD") ? "CRYPTO" : "EQUITY", timeZone: exchangeTimeZone(activeDataset.data.exchange) }) : null, [activeDataset, activePanel.symbol, activePanel.timeframe]);
  const rangedProfiles = useMemo(() => activeDataset ? activeProfileDefinitions.flatMap<RangedVolumeProfileResult & { id: string }>((definition) => { const profile = definition.kind === "FIXED" ? calculateFixedRangeVolumeProfile(activeDataset.data.bars, definition.startTimestamp, definition.endTimestamp ?? definition.startTimestamp, definition.binCount, definition.valueAreaPercent) : calculateAnchoredVolumeProfile(activeDataset.data.bars, definition.startTimestamp, definition.endTimestamp, definition.binCount, definition.valueAreaPercent); return definition.visible ? [{ ...profile, id: definition.id }] : []; }) : [], [activeDataset, activeProfileDefinitions]);
  const confluence = useMemo(() => activeDataset && activeStructure && activeDivergences ? calculateTechnicalConfluenceV2({ bars: activeDataset.data.bars, structure: activeStructure, mtfStructure, mtfLevels, profile: activeProfile, divergences: activeDivergences }) : null, [activeDataset, activeDivergences, activeProfile, activeStructure, mtfLevels, mtfStructure]);
  const panelAnalytics = useMemo(() => Object.fromEntries(visiblePanels.flatMap((panel) => {
    const key = datasetKey(panel.symbol, panel.timeframe);
    const response = datasets[key];
    if (!response) return [];
    return [[key, {
      levels: workspace.features.autoSupportResistance ? calculateTechnicalLevels(response.data.bars) : [],
      structure: workspace.features.marketStructure ? calculateMarketStructure(response.data.bars) : null,
      divergences: workspace.features.divergences ? calculateTechnicalDivergences(response.data.bars).divergences : [],
    }]];
  })), [datasets, visiblePanels, workspace.features.autoSupportResistance, workspace.features.divergences, workspace.features.marketStructure]);

  const loadKeys = useMemo(() => {
    const requested = uniqueTechnicalDatasetRequests(visiblePanels);
    if (workspace.features.structureSummary || workspace.features.marketStructure || workspace.features.mtfSupportResistance) (["15m", "1h", "4h", "1D"] as TechnicalTimeframe[]).forEach((timeframe) => requested.push({ symbol: activePanel.symbol, timeframe }));
    return [...new Map(requested.map((item) => [datasetKey(item.symbol, item.timeframe), item])).values()];
  }, [activePanel.symbol, visiblePanels, workspace.features.marketStructure, workspace.features.mtfSupportResistance, workspace.features.structureSummary]);

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
    setWorkspace((current) => current.panels.some((panel) => panel.id === panelId) ? { ...current, panels: current.panels.map((panel) => {
      if (panel.id === panelId) return { ...panel, ...patch };
      const linked: Partial<TechnicalPanelState> = {};
      if (current.links.symbol && patch.symbol) linked.symbol = patch.symbol;
      if (current.links.timeframe && patch.timeframe) linked.timeframe = patch.timeframe;
      return Object.keys(linked).length ? { ...panel, ...linked } : panel;
    }) } : current);
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
  const applyTemplate = (template: TechnicalTemplateV3) => { setWorkspace((current) => applyTechnicalTemplateV3(current, template)); setTemplateMessage(`${template.name} template applied.`); };
  const saveTemplate = () => {
    const name = sanitizeTechnicalNote(templateName).slice(0, 40);
    if (!name) { setTemplateMessage("Enter a template name."); return; }
    if (workspace.customTemplates.length >= MAX_CUSTOM_TECHNICAL_TEMPLATES) { setTemplateMessage("Maximum 20 custom templates."); return; }
    const template: TechnicalTemplateV3 = { id: `custom-${crypto.randomUUID()}`, name, builtIn: false, layout: workspace.layout, panels: workspace.panels.map(({ timeframe, chartType, indicators }) => ({ timeframe, chartType, indicators: indicators.map((item) => ({ ...item })) })), links: { ...workspace.links }, features: { ...workspace.features } };
    setWorkspace((current) => ({ ...current, customTemplates: [...current.customTemplates, template] }));
    setTemplateName(""); setTemplateMessage(`${name} saved locally.`);
  };
  const resetPreferences = () => { const next = createDefaultTechnicalWorkspaceV3(normalized); setWorkspace(next); setDrawingTool("cursor"); localStorage.removeItem(technicalV3StorageKey(normalized)); setResetArmed(false); };
  const requestFullscreen = async () => { setFullscreenError(""); try { if (!shellRef.current?.requestFullscreen) throw new Error("UNSUPPORTED"); await shellRef.current.requestFullscreen(); } catch { setFullscreenError("Fullscreen is unavailable in this browser context."); } };

  useEffect(() => {
    const bars = activeDataset?.data.bars ?? [];
    if (!bars.length) return;
    const start = bars[Math.max(0, bars.length - Math.min(80, bars.length))].timestamp;
    const end = bars.at(-1)!.timestamp;
    queueMicrotask(() => { setProfileStart((current) => bars.some((bar) => bar.timestamp === current) ? current : start); setProfileEnd((current) => bars.some((bar) => bar.timestamp === current) ? current : end); });
  }, [activeDataset]);

  const addProfile = (kind: "FIXED" | "ANCHORED") => {
    if (!activeDataset || activeProfileDefinitions.length >= MAX_TECHNICAL_PROFILES_PER_DATASET || !profileStart || (kind === "FIXED" && !profileEnd)) return;
    if (!Number.isInteger(profileBins) || profileBins < 4 || profileBins > 200 || !Number.isFinite(profileValueArea) || profileValueArea <= 0 || profileValueArea >= 100) { setTemplateMessage("Profile parameters: 4–200 bins and value area between 1% and 99%."); return; }
    if (kind === "FIXED" && Date.parse(profileEnd) < Date.parse(profileStart)) { setTemplateMessage("Fixed profile end must be after its start."); return; }
    const definition = { id: `profile-${crypto.randomUUID()}`, kind, startTimestamp: profileStart, ...(kind === "FIXED" ? { endTimestamp: profileEnd } : {}), binCount: profileBins, valueAreaPercent: profileValueArea / 100, visible: true } as const;
    setWorkspace((current) => ({ ...current, profiles: { ...current.profiles, [activeDrawingKey]: [...(current.profiles[activeDrawingKey] ?? []), definition].slice(0, MAX_TECHNICAL_PROFILES_PER_DATASET) } }));
    setTemplateMessage(`${kind === "FIXED" ? "Fixed Range" : "Anchored"} profile saved locally.`);
  };

  const activateTechnicalAlert = async () => {
    if (!activeDataset) return;
    setAlertBusy(true); setAlertMessage("");
    const nearest = mtfLevels[0] ?? activeLevels[0];
    const close = activeDataset.data.bars.at(-1)!.close;
    const parameters: Record<string, unknown> = alertCondition === "TECH_PRICE_CROSS_LEVEL" ? { level: alertValue || close, direction: "EITHER" }
      : ["TECH_PRICE_ENTER_ZONE", "TECH_PRICE_EXIT_ZONE"].includes(alertCondition) ? { low: nearest?.priceLow ?? close * 0.99, high: nearest?.priceHigh ?? close * 1.01 }
      : ["TECH_BOS_CONFIRMED", "TECH_CHOCH_CONFIRMED"].includes(alertCondition) ? { direction: "EITHER" }
      : alertCondition === "TECH_RSI_CROSS" ? { threshold: alertValue, direction: "EITHER" }
      : alertCondition === "TECH_MACD_CROSS_SIGNAL" ? { direction: "EITHER" }
      : ["TECH_DIVERGENCE_BULLISH", "TECH_DIVERGENCE_BEARISH"].includes(alertCondition) ? { indicator: "EITHER" }
      : alertCondition === "TECH_PRICE_CROSS_EMA" ? { period: Math.max(2, Math.min(250, Math.round(alertValue))), direction: "EITHER" }
      : alertCondition === "TECH_PRICE_CROSS_AVWAP" ? { anchorTimestamp: profileStart || activeDataset.data.bars[0].timestamp, direction: "EITHER" }
      : { boundary: "POC", binCount: profileBins, valueAreaPercent: profileValueArea / 100, direction: "EITHER" };
    try {
      const response = await fetch("/api/account/alerts", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ type: alertCondition, symbol: activePanel.symbol, name: activePanel.symbol, timeframe: activePanel.timeframe, parameters, cooldownMinutes: activePanel.timeframe === "1D" || activePanel.timeframe === "1W" ? 1_440 : 60 }) });
      const body = await response.json() as { error?: { message?: string } };
      if (!response.ok) throw new Error(body.error?.message ?? "Technical monitoring could not be activated.");
      setAlertMessage("Daily server monitoring active. Intermediate intraday transitions may be missed between evaluations.");
    } catch (error) { setAlertMessage(error instanceof Error ? error.message : "Technical monitoring could not be activated."); }
    finally { setAlertBusy(false); }
  };

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

  return <div className="container-shell technical-workspace technical-workspace-v2 technical-workspace-v3" ref={shellRef} data-testid="technical-chart-workspace">
    <header className="technical-page-heading">
      <div><span className="page-kicker">Technical analysis / technical-v3.0.0</span><h1>Technical chart</h1><p>Market structure, multi-timeframe levels and volume intelligence over verified OHLCV. Descriptive research, not investment advice.</p></div>
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

    <section className="technical-v2-featurebar technical-v3-featurebar" aria-label="Technical V3 overlays">
      <label><input type="checkbox" checked={workspace.features.marketStructure} onChange={(event) => setWorkspace((current) => ({ ...current, features: { ...current.features, marketStructure: event.target.checked } }))}/>Market Structure</label>
      <label><input type="checkbox" checked={workspace.features.mtfSupportResistance} onChange={(event) => setWorkspace((current) => ({ ...current, features: { ...current.features, mtfSupportResistance: event.target.checked } }))}/>MTF S/R</label>
      <label><input type="checkbox" checked={workspace.features.divergences} onChange={(event) => setWorkspace((current) => ({ ...current, features: { ...current.features, divergences: event.target.checked } }))}/>Divergences</label>
      <label><input type="checkbox" checked={workspace.features.sessionLevels} onChange={(event) => setWorkspace((current) => ({ ...current, features: { ...current.features, sessionLevels: event.target.checked } }))}/>Session Levels</label>
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
          const analytics = panelAnalytics[key] ?? { levels: [], structure: null, divergences: [] };
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
              autoLevels={analytics.levels}
              showVolumeProfile={workspace.features.volumeProfile}
              marketStructure={analytics.structure}
              structureDensity={workspace.structureDensity}
              mtfLevels={workspace.features.mtfSupportResistance ? mtfLevels : EMPTY_MTF_LEVELS}
              divergences={analytics.divergences}
              rangedProfiles={panel.id === activePanel.id ? rangedProfiles : EMPTY_RANGED_PROFILES}
              sessionAnalytics={workspace.features.sessionLevels && panel.id === activePanel.id ? sessionAnalytics : null}
              panelId={panel.id}
              linkedCrosshair={workspace.links.crosshair ? linkedCrosshair : null}
              onCrosshairTime={handleCrosshairTime}
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
        <section><header><div><span>STRUCTURE</span><strong>Label density</strong></div><small>{activeStructure?.events.length ?? 0} events</small></header><select aria-label="Market structure label density" value={workspace.structureDensity} onChange={(event) => setWorkspace((current) => ({ ...current, structureDensity: event.target.value as "MAJOR" | "ALL" }))}><option value="MAJOR">Major only</option><option value="ALL">All confirmed</option></select><p>Pivots render only after their right-side confirmation window. BOS and CHOCH use closing-price breaks.</p></section>
        <section className="technical-profile-builder"><header><div><span>VOLUME PROFILES</span><strong>Fixed & anchored</strong></div><small>{activeProfileDefinitions.length}/{MAX_TECHNICAL_PROFILES_PER_DATASET}</small></header><div className="technical-profile-fields"><label>Start<select aria-label="Profile start" value={profileStart} onChange={(event) => setProfileStart(event.target.value)}>{activeDataset?.data.bars.map((bar) => <option key={bar.timestamp} value={bar.timestamp}>{new Date(bar.timestamp).toLocaleString()}</option>)}</select></label><label>End<select aria-label="Profile end" value={profileEnd} onChange={(event) => setProfileEnd(event.target.value)}>{activeDataset?.data.bars.map((bar) => <option key={bar.timestamp} value={bar.timestamp}>{new Date(bar.timestamp).toLocaleString()}</option>)}</select></label><label>Bins<input aria-label="Profile bin count" type="number" min="4" max="200" value={profileBins} onChange={(event) => setProfileBins(Number(event.target.value))}/></label><label>Value area %<input aria-label="Profile value area percent" type="number" min="1" max="99" value={profileValueArea} onChange={(event) => setProfileValueArea(Number(event.target.value))}/></label></div><div className="technical-profile-actions"><button disabled={!activeDataset || activeProfileDefinitions.length >= MAX_TECHNICAL_PROFILES_PER_DATASET} onClick={() => addProfile("FIXED")}>+ Fixed Range</button><button disabled={!activeDataset || activeProfileDefinitions.length >= MAX_TECHNICAL_PROFILES_PER_DATASET} onClick={() => addProfile("ANCHORED")}>+ Anchored</button></div><div className="technical-profile-list">{activeProfileDefinitions.map((profile) => <div key={profile.id}><button aria-label={`Toggle ${profile.kind} profile`} onClick={() => setWorkspace((current) => ({ ...current, profiles: { ...current.profiles, [activeDrawingKey]: (current.profiles[activeDrawingKey] ?? []).map((item) => item.id === profile.id ? { ...item, visible: !item.visible } : item) } }))}>{profile.kind} · {profile.visible ? "ON" : "OFF"}</button><button aria-label={`Delete ${profile.kind} profile`} onClick={() => setWorkspace((current) => ({ ...current, profiles: { ...current.profiles, [activeDrawingKey]: (current.profiles[activeDrawingKey] ?? []).filter((item) => item.id !== profile.id) } }))}><Trash2 size={14}/></button></div>)}</div><p>Bar-based estimate; POC/VAH/VAL recalculate locally without provider requests.</p></section>
        <section><header><div><span>TEMPLATES</span><strong>Workspace presets</strong></div><small>{workspace.customTemplates.length}/20</small></header><div className="technical-template-grid">{[...BUILT_IN_TECHNICAL_TEMPLATES_V3, ...workspace.customTemplates].map((template) => <button key={template.id} aria-label={`Apply ${template.name} template`} onClick={() => applyTemplate(template)}>{template.name}</button>)}</div><div className="technical-template-save"><input aria-label="Template name" placeholder="My setup" value={templateName} onChange={(event) => setTemplateName(event.target.value)}/><button aria-label="Save custom template" onClick={saveTemplate}><Save size={15}/></button></div>{templateMessage && <p role="status">{templateMessage}</p>}</section>
        <section aria-label="Technical alert builder"><header><div><span>SERVER ALERT</span><strong>Typed condition registry</strong></div><small>Daily scheduler</small></header><select aria-label="Technical alert condition" value={alertCondition} onChange={(event) => setAlertCondition(event.target.value as TechnicalAlertConditionId)}>{TECHNICAL_ALERT_CONDITIONS.map((value) => <option key={value} value={value}>{TECHNICAL_ALERT_REGISTRY[value].label}</option>)}</select>{["TECH_PRICE_CROSS_LEVEL", "TECH_RSI_CROSS", "TECH_PRICE_CROSS_EMA"].includes(alertCondition) && <input className="technical-alert-value" aria-label="Technical alert numeric parameter" type="number" step="any" value={alertValue} onChange={(event) => setAlertValue(Number(event.target.value))}/>}<button className="technical-clear" disabled={alertBusy || !activeDataset} onClick={() => void activateTechnicalAlert()}>{alertBusy ? "Activating…" : "Activate monitoring"}</button>{alertMessage && <p role="status">{alertMessage}</p>}<p>Authenticated, user-scoped daily monitoring. Intraday rules observe only the state available at each daily evaluation and may miss intermediate crossings. Stale or unavailable data is deferred; delayed data remains labelled in notification history. Cooldown suppressions are recorded. No arbitrary expressions.</p></section>
      </aside>
    </div>

    {workspace.features.structureSummary && <section className="technical-mtf-matrix" aria-label="Multi-timeframe market structure matrix"><header><div><span>MARKET STRUCTURE V1</span><strong>{activeStructure?.state ?? "INSUFFICIENT_DATA"}</strong></div><small>Confirmed pivots · no lookahead</small></header><div>{mtfStructure.map((row) => <article key={row.timeframe}><span>{row.timeframe}</span><strong>{row.state}</strong><small>{row.asOf ? new Date(row.asOf).toLocaleString() : "Data unavailable"}</small></article>)}</div>{activeStructure?.activeRange && <p>Active range {activeStructure.activeRange.low.toFixed(2)}–{activeStructure.activeRange.high.toFixed(2)} · protected low {activeStructure.protectedLow?.price.toFixed(2) ?? "—"} · protected high {activeStructure.protectedHigh?.price.toFixed(2) ?? "—"}.</p>}</section>}
    {workspace.features.sessionLevels && <section className="technical-session-summary" aria-label="Session analytics"><strong>{sessionAnalytics?.status === "AVAILABLE" ? "Equity session levels" : "Session levels unavailable"}</strong>{sessionAnalytics?.status === "AVAILABLE" ? <span>PDH {sessionAnalytics.previousDayHigh?.toFixed(2)} · PDL {sessionAnalytics.previousDayLow?.toFixed(2)} · PDC {sessionAnalytics.previousClose?.toFixed(2)} · Open {sessionAnalytics.todayOpen?.toFixed(2)} · OR15 {sessionAnalytics.openingRange15 ? `${sessionAnalytics.openingRange15.low.toFixed(2)}–${sessionAnalytics.openingRange15.high.toFixed(2)}` : "N/A"} · OR30 {sessionAnalytics.openingRange30 ? `${sessionAnalytics.openingRange30.low.toFixed(2)}–${sessionAnalytics.openingRange30.high.toFixed(2)}` : "N/A"}</span> : <span>{sessionAnalytics?.semantics === "CRYPTO_24_7" ? "Crypto trades 24/7; equity opening-session semantics are intentionally omitted." : sessionAnalytics?.reason?.replaceAll("_", " ") ?? "Verified intraday data unavailable."}</span>}</section>}
    {workspace.features.confluence && confluence && <section className="technical-summary" aria-label="Technical confluence summary"><article><span>STRUCTURE</span><strong>{confluence.structure}</strong><p>{confluence.reasons[0] ?? "Insufficient verified history."}</p></article><article><span>HTF ALIGNMENT</span><strong>{confluence.higherTimeframeAlignment}</strong><p>15m / 1h / 4h / 1D descriptive alignment.</p></article><article><span>MOMENTUM</span><strong>{confluence.momentum}</strong><p>{confluence.reasons[1] ?? "Momentum input unavailable."}</p></article><article><span>VOLATILITY</span><strong>{confluence.volatility}</strong><p>{confluence.reasons[2] ?? "ATR context unavailable."}</p></article><article><span>VOLUME LOCATION</span><strong>{confluence.volumeLocation}</strong><p>Relative to the estimated bar-based POC/value area.</p></article><article><span>DIVERGENCE</span><strong>{confluence.divergence}</strong><p>{confluence.keyZone.replaceAll("_", " ")} · {confluence.overallAlignment} alignment.</p></article></section>}
    {workspace.features.autoSupportResistance && <section className="technical-levels-summary" aria-label="Automatic support and resistance details">{activeLevels.length ? activeLevels.map((level) => <article key={level.id}><strong>{level.type} · {level.centerPrice.toFixed(2)}</strong><span>Score {level.score}/100 · {level.touches} touches · {level.status}</span><small>{Math.abs(level.distancePct).toFixed(2)}% from current price · last test {new Date(level.lastTouch).toLocaleDateString()}</small></article>) : <p>Auto S/R unavailable: INSUFFICIENT_HISTORY or no qualified levels.</p>}</section>}
    <footer className="technical-disclosure"><span>technical-v3.0.0 · market-structure-v1.0.0 · deterministic · no lookahead</span><button onClick={() => resetArmed ? resetPreferences() : setResetArmed(true)} aria-label={resetArmed ? "Confirm reset local workspace" : "Reset local workspace"}><RotateCcw size={14}/>{resetArmed ? "Confirm reset" : "Reset local workspace"}</button><p>{drawingInstruction}. V2 state remains recoverable. Market structure and divergences are descriptive methodologies, not universal market truth or reversal guarantees. Every volume profile is estimated from aggregated bar OHLCV, not tick-level exchange volume-at-price.</p></footer>
  </div>;
}
