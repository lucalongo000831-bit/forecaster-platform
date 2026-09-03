import type {
  TechnicalFeatureState,
  TechnicalFeatureStateV3,
  TechnicalProfileDefinition,
  TechnicalTemplate,
  TechnicalTemplateV3,
  TechnicalWorkspaceV2,
  TechnicalWorkspaceV3,
} from "@/types";
import {
  applyTechnicalTemplate,
  BUILT_IN_TECHNICAL_TEMPLATES,
  createDefaultTechnicalWorkspace,
  parseTechnicalWorkspace,
  technicalV2StorageKey,
} from "./technical-workspace-v2";

export const TECHNICAL_V3_STORAGE_VERSION = 3 as const;
export const MAX_TECHNICAL_PROFILES_PER_DATASET = 5;

const DEFAULT_V3_FEATURES: TechnicalFeatureStateV3 = {
  autoSupportResistance: false,
  volumeProfile: false,
  confluence: true,
  marketStructure: false,
  mtfSupportResistance: false,
  divergences: false,
  sessionLevels: false,
  structureSummary: true,
};

export function technicalV3StorageKey(symbol: string) { return `kairo:technical:v3:${symbol.toUpperCase()}`; }
export { technicalV2StorageKey };

function extendFeatures(features?: Partial<TechnicalFeatureStateV3>): TechnicalFeatureStateV3 {
  return {
    autoSupportResistance: features?.autoSupportResistance === true,
    volumeProfile: features?.volumeProfile === true,
    confluence: features?.confluence !== false,
    marketStructure: features?.marketStructure === true,
    mtfSupportResistance: features?.mtfSupportResistance === true,
    divergences: features?.divergences === true,
    sessionLevels: features?.sessionLevels === true,
    structureSummary: features?.structureSummary !== false,
  };
}

function v2Features(features: TechnicalFeatureStateV3): TechnicalFeatureState {
  return { autoSupportResistance: features.autoSupportResistance, volumeProfile: features.volumeProfile, confluence: features.confluence };
}

function extendTemplate(template: TechnicalTemplate, rawFeatures?: Partial<TechnicalFeatureStateV3>): TechnicalTemplateV3 {
  return { ...template, features: extendFeatures({ ...template.features, ...rawFeatures }) };
}

function fromV2(workspace: TechnicalWorkspaceV2): TechnicalWorkspaceV3 {
  return {
    ...workspace,
    version: TECHNICAL_V3_STORAGE_VERSION,
    features: extendFeatures(workspace.features),
    customTemplates: workspace.customTemplates.map((template) => extendTemplate(template)),
    profiles: {},
    structureDensity: "MAJOR",
  };
}

export function createDefaultTechnicalWorkspaceV3(symbol: string): TechnicalWorkspaceV3 {
  return fromV2(createDefaultTechnicalWorkspace(symbol));
}

function sanitizeProfile(value: unknown): TechnicalProfileDefinition | null {
  if (!value || typeof value !== "object") return null;
  const item = value as Partial<TechnicalProfileDefinition>;
  const start = typeof item.startTimestamp === "string" ? Date.parse(item.startTimestamp) : Number.NaN;
  const end = typeof item.endTimestamp === "string" ? Date.parse(item.endTimestamp) : Number.NaN;
  if (typeof item.id !== "string" || !["FIXED", "ANCHORED"].includes(item.kind ?? "") || !Number.isFinite(start)) return null;
  if (item.kind === "FIXED" && (!Number.isFinite(end) || end < start)) return null;
  const binCount = typeof item.binCount === "number" && Number.isInteger(item.binCount) && item.binCount >= 4 && item.binCount <= 200 ? item.binCount : 24;
  const valueAreaPercent = typeof item.valueAreaPercent === "number" && item.valueAreaPercent > 0 && item.valueAreaPercent < 1 ? item.valueAreaPercent : 0.7;
  return { id: item.id.slice(0, 80), kind: item.kind!, startTimestamp: new Date(start).toISOString(), ...(Number.isFinite(end) ? { endTimestamp: new Date(end).toISOString() } : {}), binCount, valueAreaPercent, visible: item.visible !== false };
}

export function parseTechnicalWorkspaceV3(symbol: string, v3Value: unknown, v2Value?: unknown, v1Value?: unknown): TechnicalWorkspaceV3 {
  if (!v3Value || typeof v3Value !== "object" || (v3Value as { version?: unknown }).version !== TECHNICAL_V3_STORAGE_VERSION) {
    return fromV2(parseTechnicalWorkspace(symbol, v2Value, v1Value));
  }
  const value = v3Value as Partial<TechnicalWorkspaceV3>;
  const rawTemplates = Array.isArray(value.customTemplates) ? value.customTemplates : [];
  const v2Candidate = {
    ...value,
    version: 2,
    features: v2Features(extendFeatures(value.features)),
    customTemplates: rawTemplates.map((template) => ({ ...template, features: template && typeof template === "object" ? v2Features(extendFeatures((template as Partial<TechnicalTemplateV3>).features)) : undefined })),
  };
  const base = parseTechnicalWorkspace(symbol, v2Candidate, v1Value);
  const rawById = new Map(rawTemplates.flatMap((template) => template && typeof template === "object" && typeof (template as { id?: unknown }).id === "string" ? [[(template as { id: string }).id, template as Partial<TechnicalTemplateV3>]] : []));
  const profiles: Record<string, TechnicalProfileDefinition[]> = {};
  if (value.profiles && typeof value.profiles === "object") {
    for (const [key, rows] of Object.entries(value.profiles)) {
      if (!/^[A-Z0-9.^=-]{1,31}:(?:1m|5m|15m|30m|1h|4h|1D|1W)$/.test(key) || !Array.isArray(rows)) continue;
      const unique = new Map<string, TechnicalProfileDefinition>();
      rows.map(sanitizeProfile).forEach((profile) => { if (profile) unique.set(profile.id, profile); });
      const sanitized = [...unique.values()].slice(0, MAX_TECHNICAL_PROFILES_PER_DATASET);
      if (sanitized.length) profiles[key] = sanitized;
    }
  }
  return {
    ...base,
    version: 3,
    features: extendFeatures(value.features),
    customTemplates: base.customTemplates.map((template) => extendTemplate(template, rawById.get(template.id)?.features)),
    profiles,
    structureDensity: value.structureDensity === "ALL" ? "ALL" : "MAJOR",
  };
}

const VOLUME = { id: "volume", kind: "VOLUME" as const, color: "#5267e8", enabled: true };
const EMA20 = { id: "ema-20", kind: "EMA" as const, period: 20, color: "#20a4a8", enabled: true };
const RSI14 = { id: "rsi-14", kind: "RSI" as const, period: 14, color: "#e05e72", enabled: true };
const MACD = { id: "macd-default", kind: "MACD" as const, color: "#18a879", enabled: true };
const VWAP = { id: "vwap", kind: "VWAP" as const, color: "#9333ea", enabled: true };

export const BUILT_IN_TECHNICAL_TEMPLATES_V3: TechnicalTemplateV3[] = [
  ...BUILT_IN_TECHNICAL_TEMPLATES.map((template) => extendTemplate(template)),
  {
    id: "structure-v3",
    name: "Structure",
    builtIn: true,
    layout: "four-grid",
    panels: (["1D", "4h", "1h", "15m"] as const).map((timeframe) => ({ timeframe, chartType: "candlestick", indicators: [VOLUME] })),
    links: { crosshair: true, symbol: true, timeframe: false },
    features: { ...DEFAULT_V3_FEATURES, marketStructure: true, mtfSupportResistance: true },
  },
  {
    id: "divergence-v3",
    name: "Divergence",
    builtIn: true,
    layout: "single",
    panels: [{ timeframe: "1D", chartType: "candlestick", indicators: [VOLUME, RSI14, MACD] }],
    links: { crosshair: true, symbol: false, timeframe: false },
    features: { ...DEFAULT_V3_FEATURES, divergences: true },
  },
  {
    id: "volume-intelligence-v3",
    name: "Volume Intelligence",
    builtIn: true,
    layout: "single",
    panels: [{ timeframe: "15m", chartType: "candlestick", indicators: [VOLUME, EMA20, VWAP] }],
    links: { crosshair: true, symbol: false, timeframe: false },
    features: { ...DEFAULT_V3_FEATURES, volumeProfile: true },
  },
];

export function applyTechnicalTemplateV3(workspace: TechnicalWorkspaceV3, template: TechnicalTemplateV3): TechnicalWorkspaceV3 {
  const v2Workspace: TechnicalWorkspaceV2 = { ...workspace, version: 2, features: v2Features(workspace.features), customTemplates: workspace.customTemplates.map((item) => ({ ...item, features: v2Features(item.features) })) };
  const applied = applyTechnicalTemplate(v2Workspace, { ...template, features: v2Features(template.features) });
  return { ...workspace, ...applied, version: 3, features: { ...template.features }, customTemplates: workspace.customTemplates, profiles: workspace.profiles, structureDensity: workspace.structureDensity };
}
