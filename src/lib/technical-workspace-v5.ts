import type { TechnicalWorkspaceV4 } from "@/types";
import { parseTechnicalWorkspaceV4 } from "./technical-workspace-v4";
export type V5PriceScale = "LINEAR" | "LOGARITHMIC" | "PERCENTAGE";
export interface V5Preferences { priceScale: V5PriceScale; diagnostics: boolean; }
export const DEFAULT_V5_PREFERENCES: V5Preferences = { priceScale: "LINEAR", diagnostics: false };
export function technicalV5StorageKey(symbol: string) { return `kairo:technical:v5:${symbol.toUpperCase()}`; }
export function parseTechnicalWorkspaceV5(symbol: string, value: unknown, v4?: unknown, v3?: unknown, v2?: unknown, v1?: unknown): { workspace: TechnicalWorkspaceV4; preferences: V5Preferences } {
  const saved = value && typeof value === "object" ? value as { version?: number; workspace?: unknown; preferences?: Partial<V5Preferences> } : null;
  const valid = saved?.version === 5;
  const workspace = parseTechnicalWorkspaceV4(symbol, valid ? saved.workspace : v4, v3, v2, v1);
  return { workspace, preferences: { priceScale: valid && ["LINEAR", "LOGARITHMIC", "PERCENTAGE"].includes(saved.preferences?.priceScale ?? "") ? saved.preferences!.priceScale! : "LINEAR", diagnostics: valid && saved.preferences?.diagnostics === true } };
}
