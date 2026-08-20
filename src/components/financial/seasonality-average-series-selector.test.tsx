// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { useState } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  SeasonalityAverageSeriesSelector,
  type SeasonalityAverageSeriesId,
  type SeasonalityAverageSeriesOption,
} from "./seasonality-average-series-selector";

const options: SeasonalityAverageSeriesOption[] = [
  { id: "CURRENT", curveId: "CURRENT", label: "Current", detail: "Current-year directional series is not available", group: "AVERAGES", available: false, color: "#e95f75" },
  { id: "5Y", curveId: "5Y", label: "5 years", detail: "5 completed years · MEDIUM quality", group: "AVERAGES", available: true, color: "#6576ed" },
  { id: "10Y", curveId: "10Y", label: "10 years", detail: "10 completed years · HIGH quality", group: "AVERAGES", available: true, color: "#c94150" },
  { id: "25Y", curveId: "25Y", label: "25 years", detail: "12 completed years available", group: "AVERAGES", available: false, color: "#9c5dd5" },
  { id: "MIDTERM", curveId: "CYCLE_MIDTERM", label: "Midterm year", detail: "3 completed cycle years · LOW quality", group: "PRESIDENTIAL", available: true, color: "#6576ed" },
  { id: "BEST_CORRELATED", curveId: "YEAR_2015", label: "Best correlated year · 2015", detail: "2015 · r 0.812", group: "BEST_CORRELATED", available: true, color: "#172033" },
];

function SelectorHarness({ initial = ["5Y", "10Y"] }: { initial?: SeasonalityAverageSeriesId[] }) {
  const [selected, setSelected] = useState(new Set<SeasonalityAverageSeriesId>(initial));
  const toggle = (id: SeasonalityAverageSeriesId) => {
    const active = options.filter((option) => option.available && selected.has(option.id));
    if (selected.has(id) && active.length <= 1) return false;
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
    return true;
  };
  return <SeasonalityAverageSeriesSelector
    options={options}
    selectedSeries={selected}
    onToggle={toggle}
    onReset={() => setSelected(new Set(["5Y", "10Y"]))}
    onShowAll={() => setSelected(new Set(options.filter((option) => option.available).map((option) => option.id)))}
  />;
}

afterEach(cleanup);

describe("SeasonalityAverageSeriesSelector", () => {
  it("opens, toggles closed, closes outside and closes with Escape while restoring focus", () => {
    render(<SelectorHarness/>);
    const trigger = screen.getByRole("button", { name: "Configure average series" });
    expect(trigger).toHaveAttribute("aria-expanded", "false");
    fireEvent.click(trigger);
    expect(screen.getByRole("dialog", { name: "Configure average series" })).toBeVisible();
    expect(trigger).toHaveAttribute("aria-expanded", "true");
    fireEvent.click(trigger);
    expect(screen.queryByRole("dialog", { name: "Configure average series" })).not.toBeInTheDocument();
    fireEvent.click(trigger);
    fireEvent.pointerDown(document.body);
    expect(screen.queryByRole("dialog", { name: "Configure average series" })).not.toBeInTheDocument();
    fireEvent.click(trigger);
    fireEvent.keyDown(document, { key: "Escape" });
    expect(screen.queryByRole("dialog", { name: "Configure average series" })).not.toBeInTheDocument();
    expect(trigger).toHaveFocus();
  });

  it("uses accessible switches, dynamic best-year copy and disabled insufficient history", () => {
    render(<SelectorHarness/>);
    fireEvent.click(screen.getByRole("button", { name: "Configure average series" }));
    expect(screen.getByRole("switch", { name: "5 years" })).toHaveAttribute("aria-checked", "true");
    fireEvent.click(screen.getByRole("switch", { name: "5 years" }));
    expect(screen.getByRole("switch", { name: "5 years" })).toHaveAttribute("aria-checked", "false");
    expect(screen.getByRole("switch", { name: "25 years" })).toBeDisabled();
    expect(screen.getByRole("switch", { name: "25 years" })).toHaveAttribute("title", expect.stringContaining("Insufficient history"));
    expect(screen.getByRole("switch", { name: "Best correlated year · 2015" })).toBeEnabled();
  });

  it("supports presidential toggles, Reset and Show all available", () => {
    render(<SelectorHarness/>);
    fireEvent.click(screen.getByRole("button", { name: "Configure average series" }));
    const midterm = screen.getByRole("switch", { name: "Midterm year" });
    fireEvent.click(midterm);
    expect(midterm).toHaveAttribute("aria-checked", "true");
    fireEvent.click(screen.getByRole("button", { name: "Reset" }));
    expect(midterm).toHaveAttribute("aria-checked", "false");
    fireEvent.click(screen.getByRole("button", { name: "Show all available" }));
    expect(midterm).toHaveAttribute("aria-checked", "true");
    expect(screen.getByRole("switch", { name: "Best correlated year · 2015" })).toHaveAttribute("aria-checked", "true");
    expect(screen.getByRole("switch", { name: "25 years" })).toHaveAttribute("aria-checked", "false");
  });

  it("prevents removal of the final active series and announces feedback", () => {
    render(<SelectorHarness initial={["5Y"]}/>);
    fireEvent.click(screen.getByRole("button", { name: "Configure average series" }));
    fireEvent.click(screen.getByRole("switch", { name: "5 years" }));
    expect(screen.getByRole("switch", { name: "5 years" })).toHaveAttribute("aria-checked", "true");
    expect(screen.getByRole("status")).toHaveTextContent("At least one series must remain active.");
  });

  it("delegates each accepted toggle exactly once", () => {
    const onToggle = vi.fn(() => true);
    render(<SeasonalityAverageSeriesSelector options={options} selectedSeries={new Set(["5Y"])} onToggle={onToggle} onReset={vi.fn()} onShowAll={vi.fn()}/>);
    fireEvent.click(screen.getByRole("button", { name: "Configure average series" }));
    fireEvent.click(screen.getByRole("switch", { name: "10 years" }));
    expect(onToggle).toHaveBeenCalledOnce();
    expect(onToggle).toHaveBeenCalledWith("10Y");
  });
});
