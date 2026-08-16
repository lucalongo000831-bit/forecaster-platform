// @vitest-environment jsdom

import { cleanup, render, screen, waitFor } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { SeasonalityAnalysis } from "@/engines/seasonality";
import { SeasonalityExplorerLoader } from "./seasonality-explorer-loader";

vi.mock("./seasonality-explorer", () => ({
  SeasonalityExplorer: ({ symbol }: { symbol: string }) => <h1>Loaded {symbol}</h1>,
}));

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("SeasonalityExplorerLoader", () => {
  it("renders an immediate route skeleton and then hydrates the full analysis from the cached API", async () => {
    const request = vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(JSON.stringify({ data: { symbol: "PERF-TEST" } as SeasonalityAnalysis }), { status: 200 }));
    render(<SeasonalityExplorerLoader symbol="perf-test"/>);

    expect(screen.getByLabelText("Loading seasonality analysis")).toBeVisible();
    await waitFor(() => expect(screen.getByRole("heading", { name: "Loaded PERF-TEST" })).toBeVisible());
    expect(String(request.mock.calls[0]?.[0])).toContain("windows=1Y%2C3Y%2C5Y%2C7Y%2C10Y%2C15Y%2C20Y%2C25Y%2CMAX");
  });
});
