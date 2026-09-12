import { describe, expect, it } from "vitest";
import { instrumentQuoteRefreshIntervalMs, isUsableQuoteResponse } from "./instrument-refresh";

describe("instrument quote refresh cadence", () => {
  it("caps real-time polling at four requests per minute", () => {
    const interval = instrumentQuoteRefreshIntervalMs("Market open", "REALTIME");
    expect(interval).toBe(15_000);
    expect(60_000 / interval).toBeLessThanOrEqual(4);
  });

  it("backs off for cached, delayed, stale and closed snapshots", () => {
    expect(instrumentQuoteRefreshIntervalMs("Market open", "CACHED")).toBe(30_000);
    expect(instrumentQuoteRefreshIntervalMs("Market open", "DELAYED")).toBe(60_000);
    expect(instrumentQuoteRefreshIntervalMs("Market open", "STALE")).toBe(60_000);
    expect(instrumentQuoteRefreshIntervalMs("Market closed", "REALTIME")).toBe(60_000);
  });

  it("stays within the ten-minute request budget used by the stability audit", () => {
    const durationMs = 10 * 60_000;
    const fastestCadence = instrumentQuoteRefreshIntervalMs("Extended hours", "NEAR_REALTIME");
    expect(Math.floor(durationMs / fastestCadence)).toBe(40);
  });

  it("rejects empty and malformed refresh payloads before they can replace valid data", () => {
    expect(isUsableQuoteResponse({ data: [], meta: {} })).toBe(false);
    expect(isUsableQuoteResponse({ data: { price: null, change: 1, changePercent: 1, currency: "USD" }, meta: {} })).toBe(false);
    expect(isUsableQuoteResponse({ error: { message: "upstream unavailable" } })).toBe(false);
    expect(isUsableQuoteResponse({ data: { price: 100, change: 1, changePercent: 1, currency: "USD" }, meta: {} })).toBe(true);
  });
});
