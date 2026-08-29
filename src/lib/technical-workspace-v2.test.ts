import { describe, expect, it } from "vitest";
import { applyTechnicalTemplate, BUILT_IN_TECHNICAL_TEMPLATES, createDefaultTechnicalWorkspace, parseTechnicalWorkspace, sanitizeTechnicalDrawing, sanitizeTechnicalNote, technicalDrawingKey, uniqueTechnicalDatasetRequests, updateLinkedTechnicalPanel } from "./technical-workspace-v2";

const point = { timestamp: "2025-01-01T00:00:00.000Z", price: 100 };

describe("Technical V2 workspace schema and migration", () => {
  it("migrates V1 preferences and preserves drawings without deleting V1 state", () => {
    const legacy = {
      version: 1,
      chartType: "line",
      timeframe: "4h",
      indicators: [{ id: "rsi", kind: "RSI", period: 14, color: "#e05e72", enabled: true }],
      comparisons: ["SPY"],
      drawings: { "4h": [{ id: "old-level", type: "horizontal", points: [point], visible: false }, { id: "old-trend", type: "trend", points: [point, { ...point, timestamp: "2025-01-02T00:00:00.000Z", price: 110 }], visible: true }] },
    };
    const migrated = parseTechnicalWorkspace("NVDA", null, legacy);
    expect(migrated).toMatchObject({ version: 2, layout: "single", panels: [{ chartType: "line", timeframe: "4h", comparisons: ["SPY"] }] });
    expect(migrated.drawings[technicalDrawingKey("NVDA", "4h")]).toHaveLength(2);
    expect(migrated.drawings[technicalDrawingKey("NVDA", "4h")].map((drawing) => drawing.visible)).toEqual([false, true]);
    expect(parseTechnicalWorkspace("NVDA", migrated, legacy)).toEqual(migrated);
    expect(legacy.version).toBe(1);
  });

  it("caps valid V1 drawings before persisting or rendering migrated state", () => {
    const drawings = Array.from({ length: 125 }, (_, index) => ({
      id: `legacy-${index}`,
      type: "horizontal",
      points: [{ ...point, price: point.price + index }],
      visible: index !== 0,
    }));
    const migrated = parseTechnicalWorkspace("NVDA", null, { version: 1, drawings: { "1D": drawings } });
    expect(migrated.drawings[technicalDrawingKey("NVDA", "1D")]).toHaveLength(100);
    expect(migrated.drawings[technicalDrawingKey("NVDA", "1D")][0]).toMatchObject({ id: "legacy-0", visible: false });
  });

  it("falls back safely for corrupt V1 and V2 state", () => {
    expect(parseTechnicalWorkspace("AAPL", "{bad", "{bad")).toEqual(createDefaultTechnicalWorkspace("AAPL"));
    expect(parseTechnicalWorkspace("AAPL", { version: 2, panels: "bad" }, { version: 1, timeframe: "bad" }).panels[0].timeframe).toBe("1D");
    expect(parseTechnicalWorkspace("AAPL", { version: 999, panels: [] }, { version: 999 })).toEqual(createDefaultTechnicalWorkspace("AAPL"));
    expect(parseTechnicalWorkspace("AAPL", null, { version: 1, chartType: "line", indicators: [{ id: "bad", kind: "RSI", period: -1, color: "red", enabled: true }] }).panels[0].indicators).toEqual(createDefaultTechnicalWorkspace("AAPL").panels[0].indicators);
  });

  it("sanitizes text notes and rejects malformed drawings", () => {
    expect(sanitizeTechnicalNote(" <b>Hello</b>\u0000 world ")).toBe("bHello/b world");
    const valid = sanitizeTechnicalDrawing({ id: "note", type: "text", points: [point], text: "<script>alert(1)</script>", visible: true, createdAt: point.timestamp });
    expect(valid?.text).toBe("scriptalert(1)/script");
    expect(sanitizeTechnicalDrawing({ id: "bad", type: "fib-extension", points: [point], visible: true })).toBeNull();
  });

  it("restores a valid V2 layout while isolating panel state", () => {
    const parsed = parseTechnicalWorkspace("NVDA", { version: 2, layout: "two-horizontal", activePanelId: "a", panels: [
      { id: "a", symbol: "NVDA", timeframe: "1D", chartType: "candlestick", indicators: [{ id: "rsi", kind: "RSI", period: 14, color: "#e05e72", enabled: true }], comparisons: [] },
      { id: "b", symbol: "SPY", timeframe: "4h", chartType: "heikin-ashi", indicators: [{ id: "ema", kind: "EMA", period: 34, color: "#20a4a8", enabled: true }], comparisons: [] },
    ], links: { crosshair: true }, features: { volumeProfile: true }, drawings: {}, customTemplates: [] });
    expect(parsed.panels[0].indicators[0].period).toBe(14);
    expect(parsed.panels[1].indicators[0].period).toBe(34);
    parsed.panels[0].indicators[0].period = 21;
    expect(parsed.panels[1].indicators[0].period).toBe(34);
  });

  it("applies every built-in template deterministically", () => {
    const workspace = createDefaultTechnicalWorkspace("NVDA");
    expect(BUILT_IN_TECHNICAL_TEMPLATES.map((template) => template.name)).toEqual(["Clean", "Trend", "Momentum", "Volatility", "Swing", "Multi-Timeframe"]);
    const multi = applyTechnicalTemplate(workspace, BUILT_IN_TECHNICAL_TEMPLATES.at(-1)!);
    expect(multi.layout).toBe("four-grid");
    expect(multi.panels.map((panel) => panel.timeframe)).toEqual(["1D", "4h", "1h", "15m"]);
    expect(multi.links.crosshair).toBe(true);
    expect(BUILT_IN_TECHNICAL_TEMPLATES.map((template) => [
      template.name,
      template.layout,
      template.panels.map((panel) => panel.timeframe),
      template.panels.map((panel) => panel.indicators.map((item) => `${item.kind}:${item.period ?? "default"}`)),
      template.features,
    ])).toEqual([
      ["Clean", "single", ["1D"], [["VOLUME:default"]], { autoSupportResistance: false, volumeProfile: false, confluence: true }],
      ["Trend", "single", ["1D"], [["VOLUME:default", "EMA:20", "EMA:50", "EMA:200"]], { autoSupportResistance: false, volumeProfile: false, confluence: true }],
      ["Momentum", "single", ["1D"], [["VOLUME:default", "EMA:20", "RSI:14", "MACD:default"]], { autoSupportResistance: false, volumeProfile: false, confluence: true }],
      ["Volatility", "single", ["1D"], [["VOLUME:default", "BOLLINGER:20", "ATR:14"]], { autoSupportResistance: false, volumeProfile: false, confluence: true }],
      ["Swing", "single", ["1D"], [["VOLUME:default", "EMA:20", "EMA:50", "RSI:14"]], { autoSupportResistance: true, volumeProfile: true, confluence: true }],
      ["Multi-Timeframe", "four-grid", ["1D", "4h", "1h", "15m"], Array.from({ length: 4 }, () => ["VOLUME:default", "EMA:20"]), { autoSupportResistance: false, volumeProfile: false, confluence: true }],
    ]);
  });

  it("links only explicitly enabled symbol and timeframe dimensions", () => {
    const initial = applyTechnicalTemplate(createDefaultTechnicalWorkspace("NVDA"), BUILT_IN_TECHNICAL_TEMPLATES.at(-1)!);
    const timeframeOnly = updateLinkedTechnicalPanel({ ...initial, links: { crosshair: true, symbol: false, timeframe: true } }, "panel-1", { symbol: "AAPL", timeframe: "1W" });
    expect(timeframeOnly.panels.map((panel) => panel.timeframe)).toEqual(["1W", "1W", "1W", "1W"]);
    expect(timeframeOnly.panels.map((panel) => panel.symbol)).toEqual(["AAPL", "NVDA", "NVDA", "NVDA"]);
    const symbolOnly = updateLinkedTechnicalPanel({ ...initial, links: { crosshair: true, symbol: true, timeframe: false } }, "panel-1", { symbol: "SPY", timeframe: "4h" });
    expect(symbolOnly.panels.map((panel) => panel.symbol)).toEqual(["SPY", "SPY", "SPY", "SPY"]);
    expect(symbolOnly.panels.map((panel) => panel.timeframe)).toEqual(["4h", "4h", "1h", "15m"]);
  });

  it("deduplicates identical multi-chart and comparison dataset requests", () => {
    const panel = createDefaultTechnicalWorkspace("NVDA").panels[0];
    const requests = uniqueTechnicalDatasetRequests([
      { ...panel, id: "a", comparisons: ["SPY"] },
      { ...panel, id: "b", comparisons: ["SPY"] },
      { ...panel, id: "c", timeframe: "4h", comparisons: [] },
      { ...panel, id: "d", timeframe: "4h", comparisons: [] },
    ]);
    expect(requests).toEqual([
      { symbol: "NVDA", timeframe: "1D" },
      { symbol: "SPY", timeframe: "1D" },
      { symbol: "NVDA", timeframe: "4h" },
    ]);
  });

  it("caps custom templates without carrying user drawings into template data", () => {
    const customTemplates = Array.from({ length: 25 }, (_, index) => ({ ...BUILT_IN_TECHNICAL_TEMPLATES[0], id: `custom-${index}`, name: `Custom ${index}`, builtIn: false }));
    const parsed = parseTechnicalWorkspace("NVDA", { ...createDefaultTechnicalWorkspace("NVDA"), customTemplates });
    expect(parsed.customTemplates).toHaveLength(20);
    expect(parsed.customTemplates.every((template) => !("drawings" in template))).toBe(true);
  });
});
