import { describe, expect, it } from "vitest";
import { createDefaultTechnicalWorkspace } from "./technical-workspace-v2";
import { createDefaultTechnicalWorkspaceV3 } from "./technical-workspace-v3";
import { createDefaultTechnicalWorkspaceV4 } from "./technical-workspace-v4";
import { parseTechnicalWorkspaceV5 } from "./technical-workspace-v5";
describe("independent V1–V5 migration audit", () => {
  const drawing = { id: "audit-line", type: "horizontal" as const, points: [{ timestamp: "2025-01-01T00:00:00.000Z", price: 100 }], visible: true, createdAt: "2025-01-01T00:00:00.000Z" };
  const studies = [{ id: "ema-audit", kind: "EMA", period: 200, color: "#123456", enabled: true }];
  it("preserves V1 study/drawing/timeframe and does not mutate legacy input", () => {
    const v1 = { version: 1, chartType: "line", timeframe: "4h", indicators: studies, comparisons: ["SPY"], drawings: { "4h": [drawing] } }, serialized = JSON.stringify(v1);
    const next = parseTechnicalWorkspaceV5("NVDA", null, null, null, null, v1).workspace;
    expect(next.panels[0]).toMatchObject({ timeframe: "4h", chartType: "line", comparisons: ["SPY"], indicators: studies });
    expect(next.drawings["NVDA:4h"]).toEqual([drawing]); expect(JSON.stringify(v1)).toBe(serialized);
  });
  it.each([2, 3, 4, 5])("preserves version %i panes, studies and drawings without overwriting prior state", (version) => {
    const workspace = version === 2 ? createDefaultTechnicalWorkspace("NVDA") : version === 3 ? createDefaultTechnicalWorkspaceV3("NVDA") : createDefaultTechnicalWorkspaceV4("NVDA");
    workspace.panels[0].indicators = studies as typeof workspace.panels[0]["indicators"];
    workspace.drawings["NVDA:1D"] = [drawing]; workspace.layout = "two-horizontal";
    workspace.panels.push({ ...workspace.panels[0], id: "panel-2", symbol: "BTC-USD", timeframe: "4h", indicators: [{ id: "ssma", kind: "SMMA", period: 50, source: "hl2", color: "#654321", enabled: false }] });
    const raw = version === 5 ? { version: 5, workspace, preferences: { priceScale: "PERCENTAGE", diagnostics: true } } : workspace;
    const serialized = JSON.stringify(raw), args: [unknown, unknown, unknown, unknown, unknown] = [null, null, null, null, null]; args[5 - version] = raw;
    const next = parseTechnicalWorkspaceV5("NVDA", ...args).workspace;
    expect(next.panels).toEqual(workspace.panels); expect(next.drawings).toEqual(workspace.drawings); expect(next.layout).toBe(workspace.layout);
    expect(JSON.stringify(raw)).toBe(serialized);
    const reload = parseTechnicalWorkspaceV5("NVDA", { version: 5, workspace: next }).workspace;
    expect(reload).toEqual(next);
  });
  it.each([null, "bad-json", [], { version: 5, workspace: "bad" }, { version: 5, workspace: { version: 4, panels: [{ indicators: null }] } }])("safely rejects malformed saved envelopes: %j", (raw) => {
    expect(() => parseTechnicalWorkspaceV5("BTC-USD", raw)).not.toThrow();
    expect(parseTechnicalWorkspaceV5("BTC-USD", raw).workspace.panels[0].symbol).toBe("BTC-USD");
  });
});
