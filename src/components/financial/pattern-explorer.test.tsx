// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { analyzePattern, type PatternAnalysis } from "@/engines/pattern";
import type { MarketChartPoint } from "@/types";
import { loadPatternAnalysis } from "./pattern-analysis-client";
import { isPatternCalendarDateDisabled, PatternExplorer } from "./pattern-explorer";

vi.mock("@/components/charts/pattern-v2-chart", () => ({
  PatternV2Chart: ({ showSingleEvents, selectedEventId }: { showSingleEvents: boolean; selectedEventId: string | null }) => <div data-testid="mock-pattern-chart">Singles {String(showSingleEvents)} · Selected {selectedEventId}</div>,
}));
vi.mock("./pattern-analysis-client", () => ({ loadPatternAnalysis: vi.fn() }));

function history(crypto = false, observations = 1_800): MarketChartPoint[] {
  const rows: MarketChartPoint[] = [];
  let timestamp = Date.parse("2013-01-01T00:00:00.000Z");
  let close = 100;
  while (rows.length < observations) {
    const date = new Date(timestamp);
    if (crypto || (date.getUTCDay() !== 0 && date.getUTCDay() !== 6)) {
      const index = rows.length;
      close *= Math.exp(0.0003 + Math.sin(index / 15) * 0.004 + Math.cos(index / 47) * 0.002);
      rows.push({ timestamp: date.toISOString(), open: close * .998, high: close * 1.012, low: close * .987, close, adjustedClose: close, volume: 1_000_000 + index });
    }
    timestamp += 86_400_000;
  }
  return rows;
}

let fixture: PatternAnalysis;
let cryptoFixture: PatternAnalysis;

beforeAll(() => {
  fixture = analyzePattern("NVDA", history(), { assetClass: "EQUITY", minimumSimilarity: 0, topK: 20 });
  cryptoFixture = analyzePattern("BTC-USD", history(true), { assetClass: "CRYPTO", minimumSimilarity: 0, topK: 20 });
});

afterEach(() => {
  cleanup();
  vi.mocked(loadPatternAnalysis).mockReset();
});

describe("Pattern V2 research experience", () => {
  it("renders every core control, metric and correlated event field", () => {
    render(<PatternExplorer symbol="NVDA" initial={fixture}/>);
    expect(screen.getByRole("combobox", { name: "Lookback" })).toHaveValue("1M");
    expect(screen.getByTestId("pattern-date-stepper")).toBeVisible();
    expect(screen.getByRole("switch", { name: "Single Events" })).toHaveAttribute("aria-checked", "false");
    expect(screen.getByTestId("pattern-probability-card")).toHaveTextContent("Probability");
    expect(screen.getByTestId("pattern-probability-card")).toHaveTextContent("Robustness");
    expect(screen.getByTestId("pattern-strength-card")).toHaveTextContent(fixture.strength.classification.replaceAll("_", " "));
    const best = screen.getByTestId("most-correlated-card");
    for (const label of ["Trade", "Date", "Performance", "Max Drop", "Max Rise"]) expect(within(best).getByText(label)).toBeVisible();
    expect(screen.getByRole("heading", { name: "Correlated Past Events" })).toBeVisible();
    expect(screen.getByText(/Historical analogue analysis does not predict future performance/)).toBeVisible();
  });

  it("toggles individual event paths entirely client-side", () => {
    render(<PatternExplorer symbol="NVDA" initial={fixture}/>);
    const toggle = screen.getByRole("switch", { name: "Single Events" });
    fireEvent.click(toggle);
    expect(toggle).toHaveAttribute("aria-checked", "true");
    expect(screen.getByTestId("mock-pattern-chart")).toHaveTextContent("Singles true");
    expect(loadPatternAnalysis).not.toHaveBeenCalled();
    fireEvent.click(toggle);
    expect(screen.getByTestId("mock-pattern-chart")).toHaveTextContent("Singles false");
  });

  it("requests and applies a new lookback with controlled loading", async () => {
    const updated = analyzePattern("NVDA", history(), { assetClass: "EQUITY", lookback: "3M", minimumSimilarity: 0, topK: 20 });
    vi.mocked(loadPatternAnalysis).mockResolvedValue(updated);
    render(<PatternExplorer symbol="NVDA" initial={fixture}/>);
    fireEvent.change(screen.getByRole("combobox", { name: "Lookback" }), { target: { value: "3M" } });
    expect(screen.getByRole("status", { name: "" })).toBeInTheDocument();
    await waitFor(() => expect(screen.getByRole("combobox", { name: "Lookback" })).toHaveValue("3M"));
    expect(loadPatternAnalysis).toHaveBeenCalledWith("NVDA", "3M", fixture.reference.resolvedDate ?? undefined);
  });

  it("steps to the previous valid session and opens the full calendar", async () => {
    const previous = fixture.reference.previousValidDate;
    expect(previous).not.toBeNull();
    vi.mocked(loadPatternAnalysis).mockResolvedValue({ ...fixture, reference: { ...fixture.reference, requestedDate: previous!, resolvedDate: previous! } });
    render(<PatternExplorer symbol="NVDA" initial={fixture}/>);
    fireEvent.click(screen.getByRole("button", { name: "Previous valid reference date" }));
    await waitFor(() => expect(loadPatternAnalysis).toHaveBeenCalledWith("NVDA", "1M", previous!));
    fireEvent.click(screen.getByRole("button", { name: "Open reference date calendar" }));
    expect(screen.getByTestId("pattern-calendar")).toBeVisible();
    expect(screen.getByRole("button", { name: "Previous month" })).toBeVisible();
    expect(screen.getByRole("button", { name: "Next month" })).toBeVisible();
  });

  it("disables equity weekends but keeps crypto weekends selectable", () => {
    const latest = fixture.reference.latestAvailableDate!;
    const latestTime = Date.parse(`${latest}T12:00:00Z`);
    let weekend = "";
    for (let offset = 0; offset < 7; offset += 1) {
      const candidate = new Date(latestTime - offset * 86_400_000);
      if (candidate.getUTCDay() === 0 || candidate.getUTCDay() === 6) { weekend = candidate.toISOString().slice(0, 10); break; }
    }
    expect(isPatternCalendarDateDisabled(weekend, fixture)).toBe(true);
    const cryptoDate = cryptoFixture.reference.latestAvailableDate!;
    const cryptoTime = Date.parse(`${cryptoDate}T12:00:00Z`);
    let cryptoWeekend = cryptoDate;
    for (let offset = 0; offset < 7; offset += 1) {
      const candidate = new Date(cryptoTime - offset * 86_400_000);
      if (candidate.getUTCDay() === 0 || candidate.getUTCDay() === 6) { cryptoWeekend = candidate.toISOString().slice(0, 10); break; }
    }
    expect(isPatternCalendarDateDisabled(cryptoWeekend, cryptoFixture)).toBe(false);
  });

  it("collapses groups and selects a historical event without replacing the best match", () => {
    render(<PatternExplorer symbol="NVDA" initial={fixture}/>);
    const direction = fixture.matchedEvents[0].direction;
    const group = screen.getByRole("button", { name: new RegExp(`${direction[0]}${direction.slice(1).toLowerCase()} cases`) });
    expect(group).toHaveAttribute("aria-expanded", "true");
    fireEvent.click(group);
    expect(group).toHaveAttribute("aria-expanded", "false");
    fireEvent.click(group);
    const alternate = fixture.matchedEvents.find((event) => event.rank !== 1 && event.direction === direction);
    if (alternate) {
      const row = screen.getByText(new RegExp(alternate.similarity.toFixed(1))).closest("tr")!;
      fireEvent.click(row);
      expect(row).toHaveAttribute("aria-selected", "true");
      expect(screen.getByTestId("mock-pattern-chart")).toHaveTextContent(`Selected ${alternate.id}`);
      expect(screen.getByTestId("most-correlated-card")).toHaveTextContent("Best match");
    }
  });

  it("shows help panels and explicit insufficient-data semantics", () => {
    const insufficient: PatternAnalysis = { ...fixture, matchedEvents: [], mostCorrelated: null, averageLong: null, averageShort: null, probability: { bullish: null, bearish: null, neutral: null, sampleSize: 0, denominator: "ALL_VALID_MATCHED_EVENTS" }, robustness: { ...fixture.robustness, stars: null }, strength: { classification: "INSUFFICIENT_DATA", direction: "UNCERTAIN", dominantProbability: null }, quality: { ...fixture.quality, status: "INSUFFICIENT_SAMPLE", quality: "INSUFFICIENT", validMatchCount: 0 } };
    render(<PatternExplorer symbol="NVDA" initial={insufficient}/>);
    expect(screen.getByTestId("pattern-insufficient-state")).toHaveTextContent("INSUFFICIENT_SAMPLE");
    expect(screen.getByTestId("pattern-probability-card")).toHaveTextContent("INSUFFICIENT_SAMPLE");
    expect(screen.getByTestId("most-correlated-card")).toHaveTextContent("Dato non disponibile");
    fireEvent.click(screen.getByRole("button", { name: "Learn about Pattern strength" }));
    expect(screen.getByRole("dialog", { name: "Pattern strength" })).toHaveTextContent("dominant probability");
  });
});
