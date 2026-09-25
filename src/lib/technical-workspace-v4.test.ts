import { describe, expect, it } from "vitest";
import { createDefaultTechnicalWorkspaceV3 } from "./technical-workspace-v3";
import { createDefaultTechnicalWorkspaceV4, parseTechnicalWorkspaceV4 } from "./technical-workspace-v4";

describe("Technical workspace V4 migration", () => {
  it("migrates V3 additively and preserves panels, drawings and profiles", () => {
    const v3 = createDefaultTechnicalWorkspaceV3("NVDA");
    v3.drawings["NVDA:1D"] = [{ id: "legacy", type: "horizontal", points: [{ timestamp: "2025-01-01T00:00:00.000Z", price: 100 }], visible: true, createdAt: "2025-01-01T00:00:00.000Z" }];
    const migrated = parseTechnicalWorkspaceV4("NVDA", null, v3);
    expect(migrated.version).toBe(4); expect(migrated.panels).toEqual(v3.panels); expect(migrated.drawings).toEqual(v3.drawings); expect(migrated.panelRanges["panel-1"]?.range).toBe("1Y"); expect(migrated.features.marketStructure).toBe(v3.features.marketStructure);
  });
  it("persists independent pane ranges and sanitizes invalid custom ranges", () => {
    const v4 = createDefaultTechnicalWorkspaceV4("SPY");
    v4.panelRanges["panel-1"] = { range: "MAX", from: null, to: null, availability: "AVAILABLE", reason: null };
    const parsed = parseTechnicalWorkspaceV4("SPY", v4); expect(parsed.panelRanges["panel-1"]?.range).toBe("MAX");
    const invalid = parseTechnicalWorkspaceV4("SPY", { ...v4, panelRanges: { "panel-1": { range: "CUSTOM", from: "2025-02-01", to: "2025-01-01" } } }); expect(invalid.panelRanges["panel-1"]?.range).toBe("1Y");
  });
});
