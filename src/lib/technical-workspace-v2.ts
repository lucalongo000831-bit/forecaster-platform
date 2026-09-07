import type {
  TechnicalChartType,
  TechnicalDrawing,
  TechnicalFeatureState,
  TechnicalIndicatorConfig,
  TechnicalIndicatorKind,
  TechnicalLayout,
  TechnicalLinkState,
  TechnicalPanelState,
  TechnicalTemplate,
  TechnicalTimeframe,
  TechnicalWorkspaceV2,
} from "@/types";
import { drawingDefinition } from "@/engines/technical/drawing-registry";
import { TECHNICAL_TIMEFRAMES } from "@/engines/technical/terminal";

export const TECHNICAL_V2_STORAGE_VERSION = 2 as const;
export const MAX_CUSTOM_TECHNICAL_TEMPLATES = 20;
export const MAX_TECHNICAL_DRAWINGS_PER_DATASET = 100;

export const DEFAULT_TECHNICAL_INDICATORS: TechnicalIndicatorConfig[] = [
  { id: "volume", kind: "VOLUME", color: "#5267e8", enabled: true },
  { id: "ema-20", kind: "EMA", period: 20, color: "#20a4a8", enabled: true },
  { id: "ema-50", kind: "EMA", period: 50, color: "#f4a525", enabled: true },
];

const INDICATOR_KINDS: TechnicalIndicatorKind[] = ["SMA", "EMA", "BOLLINGER", "RSI", "MACD", "ATR", "VWAP", "VOLUME"];
const CHART_TYPES: TechnicalChartType[] = ["candlestick", "line", "area", "heikin-ashi"];
const LAYOUTS: TechnicalLayout[] = ["single", "two-vertical", "two-horizontal", "four-grid"];
const DEFAULT_LINKS: TechnicalLinkState = { crosshair: true, symbol: false, timeframe: false };
const DEFAULT_FEATURES: TechnicalFeatureState = { autoSupportResistance: false, volumeProfile: false, confluence: true };

export function technicalV2StorageKey(symbol: string) { return `kairo:technical:v2:${symbol.toUpperCase()}`; }
export function technicalV1StorageKey(symbol: string) { return `kairo:technical-chart:v1:${symbol.toUpperCase()}`; }
export function technicalDrawingKey(symbol: string, timeframe: TechnicalTimeframe) { return `${symbol.toUpperCase()}:${timeframe}`; }

export function sanitizeTechnicalNote(value: string) {
  return value.replace(/[<>\u0000-\u001f]/g, "").replace(/\s+/g, " ").trim().slice(0, 120);
}

function indicatorNeedsPeriod(kind: TechnicalIndicatorKind) { return ["SMA", "EMA", "BOLLINGER", "RSI", "ATR"].includes(kind); }
function validPeriod(value: unknown): value is number { return typeof value === "number" && Number.isInteger(value) && value >= 2 && value <= 250; }

export function sanitizeTechnicalIndicators(value: unknown): TechnicalIndicatorConfig[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap<TechnicalIndicatorConfig>((candidate) => {
    if (!candidate || typeof candidate !== "object") return [];
    const item = candidate as Partial<TechnicalIndicatorConfig>;
    if (typeof item.id !== "string" || !INDICATOR_KINDS.includes(item.kind as TechnicalIndicatorKind) || typeof item.enabled !== "boolean" || typeof item.color !== "string" || !/^#[0-9a-f]{6}$/i.test(item.color)) return [];
    if (indicatorNeedsPeriod(item.kind as TechnicalIndicatorKind) && !validPeriod(item.period)) return [];
    return [{ id: item.id.slice(0, 80), kind: item.kind as TechnicalIndicatorKind, period: item.period, color: item.color, enabled: item.enabled }];
  }).slice(0, 12);
}

function validPoint(value: unknown) {
  if (!value || typeof value !== "object") return false;
  const point = value as { timestamp?: unknown; price?: unknown };
  return typeof point.timestamp === "string" && Number.isFinite(Date.parse(point.timestamp)) && typeof point.price === "number" && Number.isFinite(point.price) && point.price > 0;
}

export function sanitizeTechnicalDrawing(value: unknown): TechnicalDrawing | null {
  if (!value || typeof value !== "object") return null;
  const item = value as Partial<TechnicalDrawing> & { type?: string };
  const definition = typeof item.type === "string" ? drawingDefinition(item.type as TechnicalDrawing["type"]) : null;
  if (!definition || typeof item.id !== "string" || !Array.isArray(item.points) || item.points.length !== definition.anchors || !item.points.every(validPoint)) return null;
  const createdAt = typeof item.createdAt === "string" && Number.isFinite(Date.parse(item.createdAt)) ? new Date(item.createdAt).toISOString() : new Date(0).toISOString();
  const text = definition.supportsText ? sanitizeTechnicalNote(typeof item.text === "string" ? item.text : "") : undefined;
  if (definition.supportsText && !text) return null;
  return { id: item.id.slice(0, 80), type: definition.id, points: item.points, visible: item.visible !== false, createdAt, ...(text ? { text } : {}) };
}

function validSymbol(value: unknown): value is string {
  return typeof value === "string" && /^(?:\^[A-Z0-9][A-Z0-9.-]{0,29}|[A-Z0-9][A-Z0-9.^=-]{0,30})$/i.test(value);
}

function sanitizePanel(value: unknown, fallbackSymbol: string, index: number): TechnicalPanelState | null {
  if (!value || typeof value !== "object") return null;
  const panel = value as Partial<TechnicalPanelState>;
  const symbol = validSymbol(panel.symbol) ? panel.symbol.toUpperCase() : fallbackSymbol.toUpperCase();
  const timeframe = TECHNICAL_TIMEFRAMES.includes(panel.timeframe as TechnicalTimeframe) ? panel.timeframe as TechnicalTimeframe : "1D";
  const chartType = CHART_TYPES.includes(panel.chartType as TechnicalChartType) ? panel.chartType as TechnicalChartType : "candlestick";
  const indicators = sanitizeTechnicalIndicators(panel.indicators);
  const comparisons = Array.isArray(panel.comparisons) ? panel.comparisons.filter(validSymbol).map((item) => item.toUpperCase()).filter((item) => item !== symbol).slice(0, 3) : [];
  return { id: typeof panel.id === "string" && panel.id ? panel.id.slice(0, 40) : `panel-${index + 1}`, symbol, timeframe, chartType, indicators: indicators.length ? indicators : DEFAULT_TECHNICAL_INDICATORS.map((indicator) => ({ ...indicator })), comparisons };
}

function indicator(kind: TechnicalIndicatorKind, period: number | undefined, color: string): TechnicalIndicatorConfig {
  return { id: `${kind.toLowerCase()}-${period ?? "default"}`, kind, period, color, enabled: true };
}

const VOLUME = indicator("VOLUME", undefined, "#5267e8");
const EMA20 = indicator("EMA", 20, "#20a4a8");
const EMA50 = indicator("EMA", 50, "#f4a525");
const EMA200 = indicator("EMA", 200, "#66758b");

export const BUILT_IN_TECHNICAL_TEMPLATES: TechnicalTemplate[] = [
  { id: "clean", name: "Clean", builtIn: true, layout: "single", panels: [{ timeframe: "1D", chartType: "candlestick", indicators: [VOLUME] }], links: DEFAULT_LINKS, features: DEFAULT_FEATURES },
  { id: "trend", name: "Trend", builtIn: true, layout: "single", panels: [{ timeframe: "1D", chartType: "candlestick", indicators: [VOLUME, EMA20, EMA50, EMA200] }], links: DEFAULT_LINKS, features: DEFAULT_FEATURES },
  { id: "momentum", name: "Momentum", builtIn: true, layout: "single", panels: [{ timeframe: "1D", chartType: "candlestick", indicators: [VOLUME, EMA20, indicator("RSI", 14, "#e05e72"), indicator("MACD", undefined, "#18a879")] }], links: DEFAULT_LINKS, features: DEFAULT_FEATURES },
  { id: "volatility", name: "Volatility", builtIn: true, layout: "single", panels: [{ timeframe: "1D", chartType: "candlestick", indicators: [VOLUME, indicator("BOLLINGER", 20, "#626ee8"), indicator("ATR", 14, "#9333ea")] }], links: DEFAULT_LINKS, features: DEFAULT_FEATURES },
  { id: "swing", name: "Swing", builtIn: true, layout: "single", panels: [{ timeframe: "1D", chartType: "candlestick", indicators: [VOLUME, EMA20, EMA50, indicator("RSI", 14, "#e05e72")] }], links: DEFAULT_LINKS, features: { autoSupportResistance: true, volumeProfile: true, confluence: true } },
  { id: "multi-timeframe", name: "Multi-Timeframe", builtIn: true, layout: "four-grid", panels: ["1D", "4h", "1h", "15m"].map((timeframe) => ({ timeframe: timeframe as TechnicalTimeframe, chartType: "candlestick" as const, indicators: [VOLUME, EMA20] })), links: { crosshair: true, symbol: true, timeframe: false }, features: DEFAULT_FEATURES },
];

export function createDefaultTechnicalWorkspace(symbol: string): TechnicalWorkspaceV2 {
  return {
    version: TECHNICAL_V2_STORAGE_VERSION,
    layout: "single",
    activePanelId: "panel-1",
    panels: [{ id: "panel-1", symbol: symbol.toUpperCase(), timeframe: "1D", chartType: "candlestick", indicators: DEFAULT_TECHNICAL_INDICATORS.map((item) => ({ ...item })), comparisons: [] }],
    links: { ...DEFAULT_LINKS },
    features: { ...DEFAULT_FEATURES },
    drawings: {},
    customTemplates: [],
  };
}

function sanitizeTemplate(value: unknown, index: number): TechnicalTemplate | null {
  if (!value || typeof value !== "object") return null;
  const template = value as Partial<TechnicalTemplate>;
  const name = sanitizeTechnicalNote(typeof template.name === "string" ? template.name : "").slice(0, 40);
  if (!name || !LAYOUTS.includes(template.layout as TechnicalLayout) || !Array.isArray(template.panels)) return null;
  const panels = template.panels.slice(0, 4).flatMap((panel) => {
    if (!panel || typeof panel !== "object") return [];
    const candidate = panel as TechnicalTemplate["panels"][number];
    if (!TECHNICAL_TIMEFRAMES.includes(candidate.timeframe) || !CHART_TYPES.includes(candidate.chartType)) return [];
    const indicators = sanitizeTechnicalIndicators(candidate.indicators);
    return [{ timeframe: candidate.timeframe, chartType: candidate.chartType, indicators }];
  });
  if (!panels.length) return null;
  return { id: typeof template.id === "string" ? template.id.slice(0, 80) : `custom-${index}`, name, builtIn: false, layout: template.layout as TechnicalLayout, panels, links: sanitizeLinks(template.links), features: sanitizeFeatures(template.features) };
}

function sanitizeLinks(value: unknown): TechnicalLinkState {
  const links = value && typeof value === "object" ? value as Partial<TechnicalLinkState> : {};
  return { crosshair: links.crosshair !== false, symbol: links.symbol === true, timeframe: links.timeframe === true };
}

function sanitizeFeatures(value: unknown): TechnicalFeatureState {
  const features = value && typeof value === "object" ? value as Partial<TechnicalFeatureState> : {};
  return { autoSupportResistance: features.autoSupportResistance === true, volumeProfile: features.volumeProfile === true, confluence: features.confluence !== false };
}

function migrateV1(symbol: string, value: unknown): TechnicalWorkspaceV2 {
  const workspace = createDefaultTechnicalWorkspace(symbol);
  if (!value || typeof value !== "object") return workspace;
  const legacy = value as { version?: unknown; chartType?: unknown; timeframe?: unknown; indicators?: unknown; comparisons?: unknown; drawings?: unknown };
  if (legacy.version !== 1) return workspace;
  const panel = workspace.panels[0];
  if (CHART_TYPES.includes(legacy.chartType as TechnicalChartType)) panel.chartType = legacy.chartType as TechnicalChartType;
  if (TECHNICAL_TIMEFRAMES.includes(legacy.timeframe as TechnicalTimeframe)) panel.timeframe = legacy.timeframe as TechnicalTimeframe;
  const indicators = sanitizeTechnicalIndicators(legacy.indicators);
  if (indicators.length) panel.indicators = indicators;
  if (Array.isArray(legacy.comparisons)) panel.comparisons = legacy.comparisons.filter(validSymbol).map((item) => item.toUpperCase()).filter((item) => item !== panel.symbol).slice(0, 3);
  if (legacy.drawings && typeof legacy.drawings === "object") {
    for (const timeframe of TECHNICAL_TIMEFRAMES) {
      const rows = (legacy.drawings as Partial<Record<TechnicalTimeframe, unknown>>)[timeframe];
      if (!Array.isArray(rows)) continue;
      const migrated = rows.flatMap<TechnicalDrawing>((row) => {
        if (!row || typeof row !== "object") return [];
        const drawing = row as { id?: unknown; type?: unknown; points?: unknown; visible?: unknown; createdAt?: unknown };
        const sanitized = sanitizeTechnicalDrawing({ ...drawing, visible: drawing.visible !== false, createdAt: drawing.createdAt ?? new Date(0).toISOString() });
        return sanitized ? [sanitized] : [];
      }).slice(0, MAX_TECHNICAL_DRAWINGS_PER_DATASET);
      if (migrated.length) workspace.drawings[technicalDrawingKey(symbol, timeframe)] = migrated;
    }
  }
  return workspace;
}

export function parseTechnicalWorkspace(symbol: string, v2Value: unknown, v1Value?: unknown): TechnicalWorkspaceV2 {
  if (!v2Value || typeof v2Value !== "object" || (v2Value as { version?: unknown }).version !== TECHNICAL_V2_STORAGE_VERSION) return migrateV1(symbol, v1Value);
  const value = v2Value as Partial<TechnicalWorkspaceV2>;
  const panels = Array.isArray(value.panels) ? value.panels.slice(0, 4).map((panel, index) => sanitizePanel(panel, symbol, index)).filter((panel): panel is TechnicalPanelState => panel !== null) : [];
  if (!panels.length) return migrateV1(symbol, v1Value);
  const layout = LAYOUTS.includes(value.layout as TechnicalLayout) ? value.layout as TechnicalLayout : "single";
  const desiredCount = layout === "single" ? 1 : layout === "four-grid" ? 4 : 2;
  while (panels.length < desiredCount) panels.push({ ...panels[0], id: `panel-${panels.length + 1}`, indicators: panels[0].indicators.map((item) => ({ ...item })), comparisons: [] });
  const drawings: Record<string, TechnicalDrawing[]> = {};
  if (value.drawings && typeof value.drawings === "object") for (const [key, rows] of Object.entries(value.drawings)) {
    if (!/^[A-Z0-9.^=-]{1,31}:(?:1m|5m|15m|30m|1h|4h|1D|1W)$/.test(key) || !Array.isArray(rows)) continue;
    const deduplicated = new Map<string, TechnicalDrawing>();
    rows.map(sanitizeTechnicalDrawing).forEach((drawing) => { if (drawing) deduplicated.set(drawing.id, drawing); });
    const valid = [...deduplicated.values()].slice(0, MAX_TECHNICAL_DRAWINGS_PER_DATASET);
    if (valid.length) drawings[key] = valid;
  }
  const customTemplates = Array.isArray(value.customTemplates) ? value.customTemplates.map(sanitizeTemplate).filter((template): template is TechnicalTemplate => template !== null).slice(0, MAX_CUSTOM_TECHNICAL_TEMPLATES) : [];
  const activePanelId = panels.some((panel) => panel.id === value.activePanelId) ? value.activePanelId! : panels[0].id;
  return { version: 2, layout, activePanelId, panels: panels.slice(0, desiredCount), links: sanitizeLinks(value.links), features: sanitizeFeatures(value.features), drawings, customTemplates };
}

export function applyTechnicalTemplate(workspace: TechnicalWorkspaceV2, template: TechnicalTemplate): TechnicalWorkspaceV2 {
  const count = template.layout === "single" ? 1 : template.layout === "four-grid" ? 4 : 2;
  const active = workspace.panels.find((panel) => panel.id === workspace.activePanelId) ?? workspace.panels[0];
  const panels = Array.from({ length: count }, (_, index) => {
    const source = template.panels[index] ?? template.panels[0];
    const existing = workspace.panels[index] ?? active;
    return { id: workspace.panels[index]?.id ?? `panel-${index + 1}`, symbol: existing.symbol, timeframe: source.timeframe, chartType: source.chartType, indicators: source.indicators.map((item) => ({ ...item })), comparisons: existing.comparisons };
  });
  return { ...workspace, layout: template.layout, panels, activePanelId: panels[0].id, links: { ...template.links }, features: { ...template.features } };
}

export function updateLinkedTechnicalPanel(workspace: TechnicalWorkspaceV2, panelId: string, patch: Partial<TechnicalPanelState>): TechnicalWorkspaceV2 {
  if (!workspace.panels.some((panel) => panel.id === panelId)) return workspace;
  return {
    ...workspace,
    panels: workspace.panels.map((panel) => {
      if (panel.id === panelId) return { ...panel, ...patch };
      const linked: Partial<TechnicalPanelState> = {};
      if (workspace.links.symbol && patch.symbol) linked.symbol = patch.symbol;
      if (workspace.links.timeframe && patch.timeframe) linked.timeframe = patch.timeframe;
      return Object.keys(linked).length ? { ...panel, ...linked } : panel;
    }),
  };
}

export function uniqueTechnicalDatasetRequests(panels: TechnicalPanelState[]) {
  const requests = new Map<string, { symbol: string; timeframe: TechnicalTimeframe }>();
  panels.forEach((panel) => {
    requests.set(`${panel.symbol.toUpperCase()}:${panel.timeframe}`, { symbol: panel.symbol.toUpperCase(), timeframe: panel.timeframe });
    panel.comparisons.forEach((comparison) => requests.set(`${comparison.toUpperCase()}:${panel.timeframe}`, { symbol: comparison.toUpperCase(), timeframe: panel.timeframe }));
  });
  return [...requests.values()];
}
