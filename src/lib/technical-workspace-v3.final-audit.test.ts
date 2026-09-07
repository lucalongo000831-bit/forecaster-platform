import { describe, expect, it } from "vitest";
import { createDefaultTechnicalWorkspace } from "./technical-workspace-v2";
import { createDefaultTechnicalWorkspaceV3, parseTechnicalWorkspaceV3, technicalV3StorageKey } from "./technical-workspace-v3";

const timestamp = "2025-01-01T00:00:00.000Z";

describe("Technical Workspace V3 independent migration audit", () => {
  it("preserves a realistic V2 workspace without mutating its recovery source", () => {
    const v2 = createDefaultTechnicalWorkspace("NVDA");
    v2.layout = "four-grid";
    v2.panels = ["1D", "4h", "1h", "15m"].map((timeframe, index) => ({ ...v2.panels[0], id: `panel-${index + 1}`, timeframe: timeframe as typeof v2.panels[0]["timeframe"], chartType: index === 1 ? "heikin-ashi" : "candlestick", comparisons: index === 0 ? ["SPY"] : [] }));
    v2.drawings["NVDA:1D"] = [
      { id: "level", type: "horizontal", points: [{ timestamp, price: 100 }], visible: true, createdAt: timestamp },
      { id: "level", type: "horizontal", points: [{ timestamp, price: 101 }], visible: true, createdAt: timestamp },
      { id: "trend", type: "trend", points: [{ timestamp, price: 100 }, { timestamp: "2025-01-02T00:00:00.000Z", price: 110 }], visible: true, createdAt: timestamp },
    ];
    const snapshot = structuredClone(v2);
    const migrated = parseTechnicalWorkspaceV3("NVDA", null, v2);
    expect(migrated).toMatchObject({ version: 3, layout: "four-grid", structureDensity: "MAJOR" });
    expect(migrated.panels.map(({ timeframe }) => timeframe)).toEqual(["1D", "4h", "1h", "15m"]);
    expect(migrated.drawings["NVDA:1D"].map(({ id }) => id)).toEqual(["level", "trend"]);
    expect(v2).toEqual(snapshot);
    expect(technicalV3StorageKey("nvda")).toBe("kairo:technical:v3:NVDA");
  });

  it("sanitizes and caps profile definitions without persisting derived arrays", () => {
    const workspace = createDefaultTechnicalWorkspaceV3("NVDA");
    workspace.profiles["NVDA:1D"] = Array.from({ length: 8 }, (_, index) => ({ id: index === 1 ? "profile-0" : `profile-${index}`, kind: index % 2 ? "FIXED" as const : "ANCHORED" as const, startTimestamp: timestamp, ...(index % 2 ? { endTimestamp: "2025-02-01T00:00:00.000Z" } : {}), binCount: 24, valueAreaPercent: 0.7, visible: true }));
    const parsed = parseTechnicalWorkspaceV3("NVDA", workspace);
    expect(parsed.profiles["NVDA:1D"]).toHaveLength(5);
    expect(new Set(parsed.profiles["NVDA:1D"].map(({ id }) => id)).size).toBe(5);
    expect(Object.keys(parsed.profiles["NVDA:1D"][0]).sort()).toEqual(["binCount", "endTimestamp", "id", "kind", "startTimestamp", "valueAreaPercent", "visible"]);
    expect(parseTechnicalWorkspaceV3("NVDA", structuredClone(parsed))).toEqual(parsed);
  });

  it("falls back safely through V2 and V1 instead of trusting corrupt V3", () => {
    const v2 = createDefaultTechnicalWorkspace("SPY");
    v2.layout = "two-horizontal";
    expect(parseTechnicalWorkspaceV3("SPY", { version: 3, panels: "bad" }, v2)).toMatchObject({ version: 3, layout: "two-horizontal" });
    expect(parseTechnicalWorkspaceV3("AAPL", "{bad", null, { version: 1, timeframe: "4h", chartType: "line" })).toMatchObject({ version: 3, panels: [{ timeframe: "4h", chartType: "line" }] });
  });
});
