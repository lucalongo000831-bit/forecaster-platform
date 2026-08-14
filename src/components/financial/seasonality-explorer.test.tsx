// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import type { MarketChartPoint } from "@/types";
import { SEASONALITY_HISTORICAL_WINDOWS, analyzeSeasonality, type SeasonalityAnalysis } from "@/engines/seasonality";
import { SeasonalityExplorer } from "./seasonality-explorer";

vi.mock("@/components/charts/seasonality-v2-charts", () => ({
  seasonalityColorFor: () => "#40d7a5",
  ProbabilityRing: ({ value, label }: { value: number | null; label: string }) => <div>{label}: {value ?? "N/A"}%</div>,
  SeasonalityCurvesChart: ({ onRangeChange }: { onRangeChange?: (start: string, end: string) => void }) => <button onClick={() => onRangeChange?.("03-01", "04-01")}>Select chart range</button>,
  SeasonalityDirectionalChart: ({ series, visibleIds }: { series: Array<{ buckets: Array<{ label: string }> }>; visibleIds?: Set<string> }) => <div><span data-testid="directional-visible">Visible: {[...(visibleIds ?? [])].join(",")}</span><span>Weekdays: {series[0]?.buckets.map((bucket) => bucket.label).join(",")}</span></div>,
}));

const NOW = new Date("2026-08-01T12:00:00.000Z");
let fixture: SeasonalityAnalysis;
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
  etfFixture = analyzeSeasonality("SPY", dailyHistory(), { assetClass: "ETF", windows: ["5Y", "10Y"], now: NOW }, "test", "fixture");
  cryptoFixture = analyzeSeasonality("BTC-USD", dailyHistory(true, 2018), { assetClass: "CRYPTO", windows: [...SEASONALITY_HISTORICAL_WINDOWS], now: NOW }, "test", "fixture");
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  sessionStorage.clear();
});

function mockRefresh() {
  return vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(JSON.stringify({ data: fixture }), { status: 200, headers: { "content-type": "application/json" } }));
}

describe("SeasonalityExplorer interactions", () => {
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

  it("uses chart series settings in the Daily view", () => {
    render(<SeasonalityExplorer symbol="AAPL" initial={fixture}/>);
    const daily = screen.getByRole("heading", { name: "Daily" }).closest("section")!;
    expect(within(daily).getByTestId("directional-visible")).toHaveTextContent("5Y");
    fireEvent.click(screen.getByRole("button", { name: /^5Y historical average$/ }));
    expect(within(daily).getByTestId("directional-visible")).not.toHaveTextContent("5Y");
  });

  it("renders five exchange weekdays for ETFs", () => {
    render(<SeasonalityExplorer symbol="SPY" initial={etfFixture}/>);
    const weekly = screen.getByRole("heading", { name: "Weekly" }).closest("section")!;
    expect(within(weekly).getByText(/Weekdays: Mon,Tue,Wed,Thu,Fri$/)).toBeInTheDocument();
  });

  it("renders seven UTC weekdays for crypto", () => {
    render(<SeasonalityExplorer symbol="BTC-USD" initial={cryptoFixture}/>);
    const weekly = screen.getByRole("heading", { name: "Weekly" }).closest("section")!;
    expect(within(weekly).getByText(/Weekdays: Mon,Tue,Wed,Thu,Fri,Sat,Sun$/)).toBeInTheDocument();
  });
});
