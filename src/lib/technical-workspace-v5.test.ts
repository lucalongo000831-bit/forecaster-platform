import { describe, expect, it } from "vitest";
import { createDefaultTechnicalWorkspaceV4 } from "./technical-workspace-v4";
import { parseTechnicalWorkspaceV5 } from "./technical-workspace-v5";
describe("V5 non-destructive workspace migration", () => {
  it("preserves V4 drawings, planner, range, template, symbol and interval", () => {
    const v4 = createDefaultTechnicalWorkspaceV4("NVDA");
    v4.panelRanges["panel-1"].range = "MAX"; v4.panels[0].timeframe = "4h";
    v4.planners["NVDA:4h"] = { side: "LONG", entry: 100, stop: 90, targets: [120, null, null], accountSize: 10000, riskPercent: 1, atr: 3, fractional: false };
    const copy = JSON.stringify(v4); const migrated = parseTechnicalWorkspaceV5("NVDA", null, v4);
    expect(migrated.workspace.panelRanges["panel-1"].range).toBe("MAX");
    expect(migrated.workspace.panels[0].timeframe).toBe("4h");
    expect(migrated.workspace.planners).toEqual(v4.planners); expect(JSON.stringify(v4)).toBe(copy);
  });
  it("roundtrips independent study configurations and V5 preferences", () => {
    const workspace = createDefaultTechnicalWorkspaceV4("BTC-USD");
    workspace.panels[0].indicators = [{ id: "one", kind: "SMMA", period: 200, color: "#123456", enabled: true, source: "hl2", lineWidth: 4 }, { id: "two", kind: "SMMA", period: 200, color: "#654321", enabled: false, source: "close", lineWidth: 1 }];
    const saved = JSON.parse(JSON.stringify({ version: 5, workspace, preferences: { priceScale: "LOGARITHMIC", diagnostics: true } }));
    const result = parseTechnicalWorkspaceV5("BTC-USD", saved);
    expect(result.workspace.panels[0].indicators).toEqual(workspace.panels[0].indicators);
    expect(result.preferences).toEqual(saved.preferences);
  });
});
