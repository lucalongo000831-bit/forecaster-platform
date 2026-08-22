// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { renderToString } from "react-dom/server";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import type { MarketChartPoint } from "@/types";
import { SEASONALITY_HISTORICAL_WINDOWS, analyzeSeasonality, type SeasonalityAnalysis } from "@/engines/seasonality";
import { SeasonalityExplorer } from "./seasonality-explorer";

vi.mock("@/components/charts/seasonality-v2-charts", () => ({
  seasonalityColorFor: () => "#40d7a5",
  ProbabilityRing: ({ value, label }: { value: number | null; label: string }) => <div>{label}: {value ?? "N/A"}%</div>,
  SeasonalityCurvesChart: ({ onRangeChange }: { onRangeChange?: (start: string, end: string) => void }) => <button onClick={() => onRangeChange?.("03-01", "04-01")}>Select chart range</button>,
  SeasonalityDirectionalChart: ({ series, visibleIds }: {
    series: Array<{ seriesId: string; buckets: Array<{ key: string | number; label: string; score: number | null }> }>;
    visibleIds?: Set<string>;
  }) => {
    const visible = series.filter((item) => !visibleIds || visibleIds.has(item.seriesId));
    const values = visible.map((item) => ({ id: item.seriesId, buckets: item.buckets.map((bucket) => [bucket.key, bucket.score]) }));
    return <div><span data-testid="directional-visible">Visible: {[...(visibleIds ?? [])].join(",")}</span><output data-testid="directional-values">{JSON.stringify(values)}</output><span>Weekdays: {series[0]?.buckets.map((bucket) => bucket.label).join(",")}</span></div>;
  },
}));

const NOW = new Date("2026-08-01T12:00:00.000Z");
let fixture: SeasonalityAnalysis;
let longFixture: SeasonalityAnalysis;
let etfFixture: SeasonalityAnalysis;
let cryptoFixture: SeasonalityAnalysis;

function dailyHistory(includeWeekends = false, fromYear = 2011): MarketChartPoint[] {
  const rows: MarketChartPoint[] = [];
  let price = 100;
  for (let date = new Date(Date.UTC(fromYear, 0, 1)); date <= NOW; date = new Date(date.getTime() + 86_400_000)) {
    if (!includeWeekends && (date.getUTCDay() === 0 || date.getUTCDay() === 6)) continue;
    const open = price;
    price *= 1 + Math.sin(date.getUTCDate() / 4) * 0.0005 + 0.0002;
    rows.push({ timestamp: date.toISOString(), open, high: Math.max(open, price) * 1.002, low: Math.min(open, price) * 0.998, close: price, adjustedClose: price, volume: 1_000_000 });
  }
  return rows;
}

beforeAll(() => {
  fixture = analyzeSeasonality("AAPL", dailyHistory(), { windows: [...SEASONALITY_HISTORICAL_WINDOWS], now: NOW, rangeStart: "01-15", rangeEnd: "02-15", includeCycles: true, includeCorrelations: true, includeTradeStats: true, includeTable: true }, "test", "fixture");
  longFixture = analyzeSeasonality("NVDA", dailyHistory(false, 1990), { windows: [...SEASONALITY_HISTORICAL_WINDOWS], now: NOW, includeCycles: true, includeCorrelations: true, includeTradeStats: true, includeTable: true }, "test", "fixture");
  etfFixture = analyzeSeasonality("SPY", dailyHistory(), { assetClass: "ETF", windows: ["5Y", "10Y"], now: NOW }, "test", "fixture");
  cryptoFixture = analyzeSeasonality("BTC-USD", dailyHistory(true, 2018), { assetClass: "CRYPTO", windows: [...SEASONALITY_HISTORICAL_WINDOWS], now: NOW }, "test", "fixture");
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  sessionStorage.clear();
  localStorage.clear();
});

function mockRefresh() {
  return vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(JSON.stringify({ data: fixture }), { status: 200, headers: { "content-type": "application/json" } }));
}

describe("SeasonalityExplorer interactions", () => {
  it("renders the complete Seasonality V2 research workflow", () => {
    render(<SeasonalityExplorer symbol="AAPL" initial={fixture}/>);
    for (const heading of ["Seasonality charts", "Correlation", "Trade stats", "Historical trade table", "Monthly matrix", "Daily Average", "Weekly Average", "Monthly Average"]) {
      expect(screen.getByRole("heading", { name: heading })).toBeVisible();
      expect(screen.getByLabelText(`About ${heading}`)).toBeVisible();
    }
    expect(screen.getByText("Chart series")).toBeVisible();
    expect(screen.getByRole("button", { name: "Long" })).toBeVisible();
    expect(screen.getByRole("button", { name: "Short" })).toBeVisible();
    expect(screen.getByLabelText("Start date")).toBeVisible();
    expect(screen.getByLabelText("End date")).toBeVisible();
    expect(screen.getByRole("button", { name: "Download all available seasonality curves as CSV" })).toBeVisible();
    expect(screen.getByRole("button", { name: "Download monthly matrix as CSV" })).toBeVisible();
    expect(screen.getByText(/Current year remains separate from every historical average/)).toBeVisible();
  });

  it("toggles chart series and persists the selection for the session", async () => {
    render(<SeasonalityExplorer symbol="AAPL" initial={fixture}/>);
    const fiveYear = screen.getByRole("button", { name: /^5Y historical average$/ });
    expect(fiveYear).toHaveAttribute("aria-pressed", "true");
    fireEvent.click(fiveYear);
    expect(fiveYear).toHaveAttribute("aria-pressed", "false");
    await waitFor(() => expect(sessionStorage.getItem("kairo-seasonality-series:AAPL")).not.toContain('"5Y"'));
  });

  it("changes the monthly matrix range without requesting new provider data", () => {
    const request = mockRefresh();
    render(<SeasonalityExplorer symbol="AAPL" initial={fixture}/>);
    const section = screen.getByRole("heading", { name: "Monthly matrix" }).closest("section");
    expect(section).not.toBeNull();
    fireEvent.click(within(section!).getByRole("button", { name: "5Y" }));
    expect(screen.getByText("Summary uses 5 completed years")).toBeInTheDocument();
    expect(request).not.toHaveBeenCalled();
  });

  it("supports every monthly matrix horizon locally", () => {
    render(<SeasonalityExplorer symbol="AAPL" initial={fixture}/>);
    const section = screen.getByRole("heading", { name: "Monthly matrix" }).closest("section")!;
    for (const range of ["5Y", "10Y", "15Y", "20Y", "25Y", "All"]) {
      fireEvent.click(within(section).getByRole("button", { name: range }));
      expect(within(section).getByText(/Summary uses \d+ completed years/)).toBeInTheDocument();
    }
  });

  it("keeps the current partial month visible and future months empty", () => {
    render(<SeasonalityExplorer symbol="AAPL" initial={fixture}/>);
    const section = screen.getByRole("heading", { name: "Monthly matrix" }).closest("section")!;
    expect(within(section).getByText("YTD")).toBeInTheDocument();
    expect(within(section).getAllByText("—").length).toBeGreaterThan(0);
    expect(within(section).getByText(/Incomplete current month/)).toBeInTheDocument();
  });

  it("disables windows that do not have enough completed crypto history", () => {
    render(<SeasonalityExplorer symbol="BTC-USD" initial={cryptoFixture}/>);
    const charts = screen.getByRole("region", { name: "Seasonality charts" });
    expect(within(charts).getByRole("button", { name: "15Y" })).toBeDisabled();
    expect(within(charts).getByRole("button", { name: "25Y" })).toBeDisabled();
  });

  it("recalculates LONG/SHORT and cleared ranges through the server route", async () => {
    const request = mockRefresh();
    render(<SeasonalityExplorer symbol="AAPL" initial={fixture}/>);
    fireEvent.click(screen.getByRole("button", { name: "Short" }));
    await waitFor(() => expect(String(request.mock.calls.at(-1)?.[0])).toContain("side=SHORT"));
    fireEvent.click(screen.getByRole("button", { name: "Clear selected date range" }));
    await waitFor(() => {
      const url = String(request.mock.calls.at(-1)?.[0]);
      expect(url).toContain("rangeStart=01-01");
      expect(url).toContain("rangeEnd=12-31");
    });
  });

  it("synchronizes a dragged chart range with the server request", async () => {
    const request = mockRefresh();
    render(<SeasonalityExplorer symbol="AAPL" initial={fixture}/>);
    fireEvent.click(screen.getByRole("button", { name: "Select chart range" }));
    await waitFor(() => {
      const url = String(request.mock.calls.at(-1)?.[0]);
      expect(url).toContain("rangeStart=03-01");
      expect(url).toContain("rangeEnd=04-01");
    });
  });

  it("applies calendar date selector values to the server request", async () => {
    const request = mockRefresh();
    render(<SeasonalityExplorer symbol="AAPL" initial={fixture}/>);
    fireEvent.change(screen.getByLabelText("Start date"), { target: { value: "2024-04-15" } });
    fireEvent.change(screen.getByLabelText("End date"), { target: { value: "2024-06-30" } });
    fireEvent.click(screen.getByRole("button", { name: "Recalculate" }));
    await waitFor(() => {
      const url = String(request.mock.calls.at(-1)?.[0]);
      expect(url).toContain("rangeStart=04-15");
      expect(url).toContain("rangeEnd=06-30");
    });
  });

  it("updates the daily month selection through the analysis endpoint", async () => {
    const request = mockRefresh();
    render(<SeasonalityExplorer symbol="AAPL" initial={fixture}/>);
    fireEvent.change(screen.getByRole("combobox", { name: "Calendar month" }), { target: { value: "2" } });
    fireEvent.click(screen.getByRole("button", { name: "Update daily view" }));
    await waitFor(() => expect(String(request.mock.calls.at(-1)?.[0])).toContain("month=2"));
  });

  it("shares average series visibility across Daily, Weekly and Monthly without provider requests", async () => {
    const request = mockRefresh();
    render(<SeasonalityExplorer symbol="AAPL" initial={fixture}/>);
    const daily = screen.getByRole("heading", { name: "Daily Average" }).closest("section")!;
    const weekly = screen.getByRole("heading", { name: "Weekly Average" }).closest("section")!;
    const monthly = screen.getByRole("heading", { name: "Monthly Average" }).closest("section")!;
    expect(within(daily).getByTestId("directional-visible")).toHaveTextContent("5Y");
    fireEvent.click(within(daily).getByRole("button", { name: "Configure average series" }));
    fireEvent.click(screen.getByRole("switch", { name: "5 years" }));
    expect(within(daily).getByTestId("directional-visible")).not.toHaveTextContent("5Y");
    expect(within(weekly).getByTestId("directional-visible")).not.toHaveTextContent("5Y");
    expect(within(monthly).getByTestId("directional-visible")).not.toHaveTextContent("5Y");
    expect(within(daily).getByLabelText("Daily Average visible series legend")).not.toHaveTextContent("5Y historical average");
    expect(within(weekly).getByLabelText("Weekly Average visible series legend")).not.toHaveTextContent("5Y historical average");
    expect(within(monthly).getByLabelText("Monthly Average visible series legend")).not.toHaveTextContent("5Y historical average");
    expect(request).not.toHaveBeenCalled();
    await waitFor(() => expect(localStorage.getItem("kairo:seasonality:average-series")).not.toContain('"5Y"'));
  });

  it("restores a global versioned average preference and ignores invalid storage", async () => {
    localStorage.setItem("kairo:seasonality:average-series", JSON.stringify({ version: 1, selected: ["3Y"] }));
    const { unmount } = render(<SeasonalityExplorer symbol="AAPL" initial={fixture}/>);
    const daily = screen.getByRole("heading", { name: "Daily Average" }).closest("section")!;
    await waitFor(() => expect(within(daily).getByTestId("directional-visible")).toHaveTextContent("3Y"));
    expect(within(daily).getByTestId("directional-visible")).not.toHaveTextContent("5Y");
    unmount();

    localStorage.setItem("kairo:seasonality:average-series", "{invalid");
    render(<SeasonalityExplorer symbol="SPY" initial={etfFixture}/>);
    const etfDaily = screen.getByRole("heading", { name: "Daily Average" }).closest("section")!;
    expect(within(etfDaily).getByTestId("directional-visible")).toHaveTextContent("5Y");
  });

  it("renders safely during SSR without reading browser storage", () => {
    expect(() => renderToString(<SeasonalityExplorer symbol="AAPL" initial={fixture}/>)).not.toThrow();
  });

  it("renders five exchange weekdays for ETFs", () => {
    render(<SeasonalityExplorer symbol="SPY" initial={etfFixture}/>);
    const weekly = screen.getByRole("heading", { name: "Weekly Average" }).closest("section")!;
    expect(within(weekly).getByText(/Weekdays: Mon,Tue,Wed,Thu,Fri$/)).toBeInTheDocument();
  });

  it("renders seven UTC weekdays for crypto", () => {
    render(<SeasonalityExplorer symbol="BTC-USD" initial={cryptoFixture}/>);
    const weekly = screen.getByRole("heading", { name: "Weekly Average" }).closest("section")!;
    expect(within(weekly).getByText(/Weekdays: Mon,Tue,Wed,Thu,Fri,Sat,Sun$/)).toBeInTheDocument();
  });
});

describe("Seasonality Average Series final audit", () => {
  it("keeps Daily, Weekly and Monthly quantitative values identical after hide and restore", () => {
    const request = mockRefresh();
    render(<SeasonalityExplorer symbol="NVDA" initial={longFixture}/>);
    const sections = ["Daily Average", "Weekly Average", "Monthly Average"].map((name) => screen.getByRole("heading", { name }).closest("section")!);
    const before = sections.map((section) => within(section).getByTestId("directional-values").textContent);

    fireEvent.click(within(sections[0]).getByRole("button", { name: "Configure average series" }));
    fireEvent.click(screen.getByRole("switch", { name: "10 years" }));
    for (const section of sections) expect(within(section).getByTestId("directional-values")).not.toHaveTextContent('"id":"10Y"');
    fireEvent.click(screen.getByRole("switch", { name: "10 years" }));

    sections.forEach((section, index) => expect(within(section).getByTestId("directional-values").textContent).toBe(before[index]));
    expect(request).not.toHaveBeenCalled();
  });

  it("preserves a supported 25Y preference across an incompatible crypto asset", async () => {
    localStorage.setItem("kairo:seasonality:average-series", JSON.stringify({ version: 1, selected: ["25Y"] }));
    const first = render(<SeasonalityExplorer symbol="NVDA" initial={longFixture}/>);
    await waitFor(() => expect(within(screen.getByRole("heading", { name: "Daily Average" }).closest("section")!).getByTestId("directional-visible")).toHaveTextContent("25Y"));
    first.unmount();

    const second = render(<SeasonalityExplorer symbol="BTC-USD" initial={cryptoFixture}/>);
    fireEvent.click(within(screen.getByRole("heading", { name: "Daily Average" }).closest("section")!).getByRole("button", { name: "Configure average series" }));
    expect(screen.getByRole("switch", { name: "25 years" })).toBeDisabled();
    expect(screen.getByRole("switch", { name: "25 years" })).toHaveAttribute("aria-checked", "false");
    second.unmount();

    render(<SeasonalityExplorer symbol="NVDA" initial={longFixture}/>);
    await waitFor(() => expect(within(screen.getByRole("heading", { name: "Daily Average" }).closest("section")!).getByTestId("directional-visible")).toHaveTextContent("25Y"));
  });

  it("ignores an obsolete localStorage schema and safely restores Kairo defaults", async () => {
    localStorage.setItem("kairo:seasonality:average-series", JSON.stringify({ version: 0, selected: ["3Y"] }));
    render(<SeasonalityExplorer symbol="AAPL" initial={fixture}/>);
    const daily = screen.getByRole("heading", { name: "Daily Average" }).closest("section")!;
    await waitFor(() => expect(within(daily).getByTestId("directional-visible")).toHaveTextContent("5Y"));
    expect(within(daily).getByTestId("directional-visible")).not.toHaveTextContent("3Y");
  });

  it("keeps average-series visibility after a Daily month recalculation", async () => {
    const request = mockRefresh();
    render(<SeasonalityExplorer symbol="AAPL" initial={fixture}/>);
    const daily = screen.getByRole("heading", { name: "Daily Average" }).closest("section")!;
    fireEvent.click(within(daily).getByRole("button", { name: "Configure average series" }));
    fireEvent.click(screen.getByRole("switch", { name: "10 years" }));
    fireEvent.change(screen.getByRole("combobox", { name: "Calendar month" }), { target: { value: "9" } });
    fireEvent.click(screen.getByRole("button", { name: "Update daily view" }));

    await waitFor(() => expect(String(request.mock.calls.at(-1)?.[0])).toContain("month=9"));
    expect(within(daily).getByTestId("directional-visible")).not.toHaveTextContent("10Y");
    expect(screen.getByRole("switch", { name: "10 years" })).toHaveAttribute("aria-checked", "false");
  });
});
