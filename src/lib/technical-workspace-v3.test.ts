import { describe, expect, it } from "vitest";
import { createDefaultTechnicalWorkspace } from "./technical-workspace-v2";
import { applyTechnicalTemplateV3, BUILT_IN_TECHNICAL_TEMPLATES_V3, createDefaultTechnicalWorkspaceV3, parseTechnicalWorkspaceV3, technicalV3StorageKey } from "./technical-workspace-v3";

describe("Technical Workspace V3 migration", () => {
  it("migrates V2 state without mutating or deleting its recovery source", () => {
    const v2 = createDefaultTechnicalWorkspace("NVDA");
    v2.layout = "two-vertical";
    v2.drawings["NVDA:1D"] = [{ id: "d1", type: "horizontal", points: [{ timestamp: "2025-01-01T00:00:00.000Z", price: 100 }], visible: true, createdAt: "2025-01-01T00:00:00.000Z" }];
    v2.customTemplates = [{ id: "custom-1", name: "Mine", builtIn: false, layout: "single", panels: [{ timeframe: "1D", chartType: "line", indicators: [] }], links: { crosshair: true, symbol: false, timeframe: false }, features: v2.features }];
    const snapshot = structuredClone(v2);
    const migrated = parseTechnicalWorkspaceV3("NVDA", null, v2);
    expect(migrated).toMatchObject({ version: 3, layout: "two-vertical", structureDensity: "MAJOR" });
    expect(migrated.drawings["NVDA:1D"]).toHaveLength(1);
    expect(migrated.customTemplates.map((template) => template.name)).toEqual(["Mine"]);
    expect(v2).toEqual(snapshot);
    expect(technicalV3StorageKey("nvda")).not.toBe("kairo:technical:v2:NVDA");
  });

  it("is idempotent and deduplicates profiles by id", () => {
    const workspace = createDefaultTechnicalWorkspaceV3("NVDA");
    workspace.profiles["NVDA:1D"] = [
      { id: "p1", kind: "ANCHORED", startTimestamp: "2025-01-01T00:00:00.000Z", binCount: 24, valueAreaPercent: 0.7, visible: true },
      { id: "p1", kind: "ANCHORED", startTimestamp: "2025-01-01T00:00:00.000Z", binCount: 24, valueAreaPercent: 0.7, visible: true },
    ];
    const once = parseTechnicalWorkspaceV3("NVDA", workspace);
    const twice = parseTechnicalWorkspaceV3("NVDA", JSON.parse(JSON.stringify(once)));
    expect(twice).toEqual(once);
    expect(twice.profiles["NVDA:1D"]).toHaveLength(1);
  });

  it("provides V3 templates and preserves profiles while applying one", () => {
    const workspace = createDefaultTechnicalWorkspaceV3("NVDA");
    workspace.profiles["NVDA:1D"] = [{ id: "p1", kind: "ANCHORED", startTimestamp: "2025-01-01T00:00:00.000Z", binCount: 24, valueAreaPercent: 0.7, visible: true }];
    const names = BUILT_IN_TECHNICAL_TEMPLATES_V3.map((template) => template.name);
    expect(names).toEqual(expect.arrayContaining(["Structure", "Divergence", "Volume Intelligence"]));
    const applied = applyTechnicalTemplateV3(workspace, BUILT_IN_TECHNICAL_TEMPLATES_V3.find((template) => template.name === "Structure")!);
    expect(applied.layout).toBe("four-grid");
    expect(applied.features).toMatchObject({ marketStructure: true, mtfSupportResistance: true });
    expect(applied.profiles).toEqual(workspace.profiles);
  });
});
