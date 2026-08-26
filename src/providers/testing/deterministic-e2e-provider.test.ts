import { describe, expect, it } from "vitest";
import { DeterministicE2EProvider, isDeterministicE2EProviderEnabled } from "./deterministic-e2e-provider";

describe("deterministic E2E financial provider isolation", () => {
  it("requires both private local E2E process flags", () => {
    expect(isDeterministicE2EProviderEnabled({ KAIRO_E2E_PROVIDER_FIXTURES: "true", KAIRO_E2E_RUN: "playwright" })).toBe(true);
    expect(isDeterministicE2EProviderEnabled({ KAIRO_E2E_PROVIDER_FIXTURES: "true" })).toBe(false);
    expect(isDeterministicE2EProviderEnabled({ KAIRO_E2E_RUN: "playwright" })).toBe(false);
  });

  it("fails closed on Vercel Preview and Production", () => {
    expect(isDeterministicE2EProviderEnabled({ KAIRO_E2E_PROVIDER_FIXTURES: "true", KAIRO_E2E_RUN: "playwright", VERCEL: "1", VERCEL_ENV: "preview" })).toBe(false);
    expect(isDeterministicE2EProviderEnabled({ KAIRO_E2E_PROVIDER_FIXTURES: "true", KAIRO_E2E_RUN: "playwright", VERCEL: "1", VERCEL_ENV: "production" })).toBe(false);
  });

  it("serves deterministic SSR quote, profile and chart contracts", async () => {
    const provider = new DeterministicE2EProvider();
    const [quote, profile, chart] = await Promise.all([provider.quote("NVDA"), provider.profile("NVDA"), provider.chart("NVDA", "1M", "1d")]);
    expect(quote.data).toMatchObject({ symbol: "NVDA", quoteType: "EQUITY", source: "mock" });
    expect(profile.data).toMatchObject({ symbol: "NVDA", quoteType: "EQUITY", source: "mock" });
    expect(chart.data.points.length).toBeGreaterThan(15);
    expect([quote.meta.requestId, profile.meta.requestId, chart.meta.requestId]).toEqual(["deterministic-e2e-provider", "deterministic-e2e-provider", "deterministic-e2e-provider"]);
  });

  it("provides complete contiguous hourly bars for deterministic 4h resampling", async () => {
    const provider = new DeterministicE2EProvider();
    const chart = await provider.chart("NVDA", "1M", "1h");
    expect(chart.data.points.length).toBeGreaterThan(100);
    expect(chart.data.points.slice(1).every((point, index) => {
      const previous = chart.data.points[index];
      const difference = Date.parse(point.timestamp) - Date.parse(previous.timestamp);
      return difference === 3_600_000 || difference >= 17 * 3_600_000;
    })).toBe(true);
  });

  it("preserves equity, ETF and 24/7 crypto semantics including ETH-USD", async () => {
    const provider = new DeterministicE2EProvider();
    expect(provider.resolveInstrument("AAPL").kind).toBe("EQUITY");
    expect(provider.resolveInstrument("SPY").kind).toBe("ETF");
    expect(provider.resolveInstrument("BTC-USD").kind).toBe("CRYPTO");
    expect(provider.resolveInstrument("ETH-USD").kind).toBe("CRYPTO");
    const eth = await provider.chart("ETH-USD", "1M", "1d");
    expect(eth.data.points.some((point) => [0, 6].includes(new Date(point.timestamp).getUTCDay()))).toBe(true);
  });

  it("keeps a deliberate unavailable-state fixture", async () => {
    const provider = new DeterministicE2EProvider();
    expect(() => provider.quote("E2E-UNAVAILABLE")).toThrow(expect.objectContaining({ code: "UPSTREAM_UNAVAILABLE", status: 503 }));
  });
});
