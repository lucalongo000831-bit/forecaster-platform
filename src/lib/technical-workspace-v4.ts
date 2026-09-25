import type { PositionPlannerInput, TechnicalFeatureStateV4, TechnicalHistoricalRange, TechnicalPanelRangeState, TechnicalTemplateV3, TechnicalTemplateV4, TechnicalWorkspaceV3, TechnicalWorkspaceV4 } from "@/types";
import { applyTechnicalTemplateV3, BUILT_IN_TECHNICAL_TEMPLATES_V3, createDefaultTechnicalWorkspaceV3, parseTechnicalWorkspaceV3 } from "./technical-workspace-v3";

export const TECHNICAL_V4_STORAGE_VERSION = 4 as const;
export const TECHNICAL_HISTORICAL_RANGES: TechnicalHistoricalRange[] = ["1D", "5D", "1M", "3M", "6M", "YTD", "1Y", "3Y", "5Y", "10Y", "MAX", "CUSTOM"];
export function technicalV4StorageKey(symbol: string) { return `kairo:technical:v4:${symbol.toUpperCase()}`; }

export const DEFAULT_POSITION_PLANNER: PositionPlannerInput = { side: "LONG", entry: null, stop: null, targets: [null, null, null], accountSize: null, riskPercent: 1, atr: null, fractional: false };
const DEFAULT_FEATURES: TechnicalFeatureStateV4 = { autoSupportResistance: false, volumeProfile: false, confluence: true, marketStructure: true, mtfSupportResistance: false, divergences: false, sessionLevels: false, structureSummary: true, liquidity: false, fairValueGaps: false, displacement: false, positionPlanner: false, crossAsset: false, eventTimeline: true, showHistoricalFvg: false };
const defaultRange = (timeframe: string = "1D"): TechnicalPanelRangeState => ({ range: ["1m"].includes(timeframe) ? "1D" : ["5m", "15m"].includes(timeframe) ? "5D" : ["30m", "1h", "4h"].includes(timeframe) ? "1M" : "1Y", from: null, to: null, availability: "LOADING", reason: null });

function extendFeatures(features?: Partial<TechnicalFeatureStateV4>): TechnicalFeatureStateV4 {
  return { ...DEFAULT_FEATURES, ...features,
    autoSupportResistance: features?.autoSupportResistance === true, volumeProfile: features?.volumeProfile === true,
    confluence: features?.confluence !== false, marketStructure: features?.marketStructure !== false,
    mtfSupportResistance: features?.mtfSupportResistance === true, divergences: features?.divergences === true,
    sessionLevels: features?.sessionLevels === true, structureSummary: features?.structureSummary !== false,
    liquidity: features?.liquidity === true, fairValueGaps: features?.fairValueGaps === true,
    displacement: features?.displacement === true, positionPlanner: features?.positionPlanner === true,
    crossAsset: features?.crossAsset === true, eventTimeline: features?.eventTimeline !== false,
    showHistoricalFvg: features?.showHistoricalFvg === true,
  };
}
function fromV3(workspace: TechnicalWorkspaceV3): TechnicalWorkspaceV4 {
  return { ...workspace, version: 4, features: extendFeatures(workspace.features), customTemplates: workspace.customTemplates.map((row) => ({ ...row, features: extendFeatures(row.features) })), panelRanges: Object.fromEntries(workspace.panels.map((panel) => [panel.id, defaultRange(panel.timeframe)])), syncRange: false, planners: {}, benchmarks: {}, favoriteTemplateIds: [], recentSymbols: workspace.panels.map((panel) => panel.symbol).slice(0, 8) };
}
export function createDefaultTechnicalWorkspaceV4(symbol: string) { const workspace = fromV3(createDefaultTechnicalWorkspaceV3(symbol)); return { ...workspace, features: { ...workspace.features, marketStructure: true } }; }

function sanitizeRange(value: unknown): TechnicalPanelRangeState {
  if (!value || typeof value !== "object") return defaultRange();
  const row = value as Partial<TechnicalPanelRangeState>;
  const range = TECHNICAL_HISTORICAL_RANGES.includes(row.range as TechnicalHistoricalRange) ? row.range as TechnicalHistoricalRange : "1Y";
  const validDate = (date: unknown) => typeof date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(date) ? date : null;
  const from = validDate(row.from); const to = validDate(row.to);
  return { range: range === "CUSTOM" && (!from || !to || from >= to) ? "1Y" : range, from, to, availability: ["AVAILABLE", "PARTIAL", "UNAVAILABLE", "LOADING", "STALE"].includes(row.availability ?? "") ? row.availability! : "LOADING", reason: typeof row.reason === "string" ? row.reason.slice(0, 160) : null };
}
function sanitizePlanner(value: unknown): PositionPlannerInput {
  if (!value || typeof value !== "object") return { ...DEFAULT_POSITION_PLANNER, targets: [...DEFAULT_POSITION_PLANNER.targets] };
  const row = value as Partial<PositionPlannerInput>; const price = (item: unknown) => typeof item === "number" && Number.isFinite(item) && item > 0 ? item : null;
  return { side: row.side === "SHORT" ? "SHORT" : "LONG", entry: price(row.entry), stop: price(row.stop), targets: Array.isArray(row.targets) ? row.targets.slice(0, 3).map(price).concat([null, null, null]).slice(0, 3) : [null, null, null], accountSize: price(row.accountSize), riskPercent: price(row.riskPercent), atr: price(row.atr), fractional: row.fractional === true };
}
export function parseTechnicalWorkspaceV4(symbol: string, v4Value: unknown, v3Value?: unknown, v2Value?: unknown, v1Value?: unknown): TechnicalWorkspaceV4 {
  if (!v4Value || typeof v4Value !== "object" || (v4Value as { version?: unknown }).version !== 4) return fromV3(parseTechnicalWorkspaceV3(symbol, v3Value, v2Value, v1Value));
  const value = v4Value as Partial<TechnicalWorkspaceV4>;
  const v3Candidate = { ...value, version: 3, features: value.features, customTemplates: value.customTemplates };
  const base = fromV3(parseTechnicalWorkspaceV3(symbol, v3Candidate, v2Value, v1Value));
  const panelRanges = Object.fromEntries(base.panels.map((panel) => [panel.id, value.panelRanges?.[panel.id] ? sanitizeRange(value.panelRanges[panel.id]) : defaultRange(panel.timeframe)]));
  const planners = Object.fromEntries(Object.entries(value.planners ?? {}).filter(([key]) => /^[A-Z0-9.^=-]{1,31}:(?:1m|5m|15m|30m|1h|4h|1D|1W)$/.test(key)).map(([key, row]) => [key, sanitizePlanner(row)]));
  const benchmarks = Object.fromEntries(Object.entries(value.benchmarks ?? {}).filter(([key, benchmark]) => /^panel-[1-4]$/.test(key) && typeof benchmark === "string" && /^(?:\^[A-Z0-9][A-Z0-9.-]{0,29}|[A-Z0-9][A-Z0-9.^=-]{0,30})$/.test(benchmark)).map(([key, benchmark]) => [key, benchmark]));
  return { ...base, version: 4, features: extendFeatures(value.features), panelRanges, syncRange: value.syncRange === true, planners, benchmarks, favoriteTemplateIds: Array.isArray(value.favoriteTemplateIds) ? value.favoriteTemplateIds.filter((item): item is string => typeof item === "string").slice(0, 12) : [], recentSymbols: Array.isArray(value.recentSymbols) ? value.recentSymbols.filter((item): item is string => typeof item === "string" && /^[A-Z0-9.^=-]{1,31}$/.test(item)).slice(0, 8) : [symbol.toUpperCase()] };
}

function template(id: string, name: string, features: Partial<TechnicalFeatureStateV4>, timeframe: "15m" | "1h" | "1D" | "1W" = "1D"): TechnicalTemplateV4 {
  const source = BUILT_IN_TECHNICAL_TEMPLATES_V3[0]!;
  return { ...source, id, name, layout: "single", panels: [{ ...source.panels[0]!, timeframe }], features: extendFeatures(features), builtIn: true };
}
export const BUILT_IN_TECHNICAL_TEMPLATES_V4: TechnicalTemplateV4[] = [
  ...BUILT_IN_TECHNICAL_TEMPLATES_V3.map((row) => ({ ...row, features: extendFeatures(row.features) })),
  template("execution-v4", "Execution Planning", { positionPlanner: true, marketStructure: true }, "1h"),
  template("liquidity-v4", "Liquidity & Structure", { liquidity: true, fairValueGaps: true, displacement: true, marketStructure: true }),
  template("relative-v4", "Relative Strength", { crossAsset: true, marketStructure: true }),
  template("confluence-v4", "Full Confluence", { liquidity: true, fairValueGaps: true, displacement: true, crossAsset: true, divergences: true, mtfSupportResistance: true, confluence: true }),
];
export function applyTechnicalTemplateV4(workspace: TechnicalWorkspaceV4, templateValue: TechnicalTemplateV4): TechnicalWorkspaceV4 {
  const templateV3: TechnicalTemplateV3 = { ...templateValue, features: templateValue.features };
  const v3: TechnicalWorkspaceV3 = { ...workspace, version: 3, features: workspace.features, customTemplates: workspace.customTemplates };
  const applied = applyTechnicalTemplateV3(v3, templateV3);
  const next = fromV3(applied);
  return { ...workspace, ...next, features: { ...templateValue.features }, customTemplates: workspace.customTemplates, panelRanges: { ...workspace.panelRanges, ...Object.fromEntries(next.panels.map((panel) => [panel.id, defaultRange(panel.timeframe)])) }, planners: workspace.planners, benchmarks: workspace.benchmarks, favoriteTemplateIds: workspace.favoriteTemplateIds, recentSymbols: workspace.recentSymbols };
}
