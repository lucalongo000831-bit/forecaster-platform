// @vitest-environment jsdom

import { beforeEach, describe, expect, it, vi } from "vitest";
import type { PatternAnalysis } from "@/engines/pattern";

function response(symbol: string, referenceDate: string, lookback: "1M" | "3M" = "1M") {
  return {
    ok: true,
    json: async () => ({
      data: {
        symbol,
        lookback,
        reference: { resolvedDate: referenceDate, latestAvailableDate: "2026-08-20" },
      } as unknown as PatternAnalysis,
    }),
  } as Response;
}

beforeEach(() => {
  vi.resetModules();
  vi.restoreAllMocks();
});

describe("Pattern V2 client cache isolation", () => {
  it("never contaminates one symbol with another", async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const symbol = new URL(String(input), "https://kairo.local").searchParams.get("symbol")!;
      return response(symbol, "2026-08-20");
    });
    vi.stubGlobal("fetch", fetchMock);
    const { loadPatternAnalysis } = await import("./pattern-analysis-client");
    const aapl = await loadPatternAnalysis("AAPL");
    const nvda = await loadPatternAnalysis("NVDA");
    const cachedAapl = await loadPatternAnalysis("AAPL");
    expect(aapl.symbol).toBe("AAPL");
    expect(nvda.symbol).toBe("NVDA");
    expect(cachedAapl).toBe(aapl);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("separates historical references and deduplicates identical requests", async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const params = new URL(String(input), "https://kairo.local").searchParams;
      return response(params.get("symbol")!, params.get("referenceDate") ?? "2026-08-20", params.get("lookback") as "1M" | "3M");
    });
    vi.stubGlobal("fetch", fetchMock);
    const { loadPatternAnalysis } = await import("./pattern-analysis-client");
    const [sameA, sameB] = await Promise.all([
      loadPatternAnalysis("MSFT", "3M", "2025-06-20"),
      loadPatternAnalysis("MSFT", "3M", "2025-06-20"),
    ]);
    const distinct = await loadPatternAnalysis("MSFT", "3M", "2025-07-18");
    expect(sameA).toBe(sameB);
    expect(sameA.reference.resolvedDate).toBe("2025-06-20");
    expect(distinct.reference.resolvedDate).toBe("2025-07-18");
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});
