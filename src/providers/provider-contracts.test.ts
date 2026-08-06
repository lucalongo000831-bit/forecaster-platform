import { describe, expect, it } from "vitest";
import fmpProfile from "@/test/fixtures/providers/fmp-profile.json";
import alphaNews from "@/test/fixtures/providers/alpha-news.json";
import massiveSnapshot from "@/test/fixtures/providers/massive-snapshot.json";
import { fmpArraySchema, numberValue, stringValue } from "./fmp/client";
import { alphaNewsResponseSchema, mapAlphaNewsItem } from "./news/alpha-vantage-adapter";
import { massiveNumber, massiveResponseSchema, recordValue } from "./massive/client";

describe("sanitized provider contracts", () => {
  it("validates and reads an FMP profile fixture", () => {
    const parsed = fmpArraySchema.parse(fmpProfile);
    expect(stringValue(parsed[0], "symbol")).toBe("ACME");
    expect(numberValue(parsed[0], "fullTimeEmployees")).toBe(1200);
  });

  it("validates and normalizes an Alpha Vantage news fixture", () => {
    const parsed = alphaNewsResponseSchema.parse(alphaNews);
    const normalized = mapAlphaNewsItem(parsed.feed![0], 0);
    expect(normalized.relatedSymbols).toEqual(["ACME"]);
    expect(normalized.overallSentimentScore).toBeCloseTo(0.21);
    expect(normalized.publishedAt).toBe("2026-01-15T14:30:00.000Z");
  });

  it("validates and reads a Massive snapshot fixture", () => {
    const parsed = massiveResponseSchema.parse(massiveSnapshot) as Record<string, unknown>;
    const ticker = recordValue(parsed, "ticker");
    expect(massiveNumber(recordValue(ticker, "lastTrade"), "p")).toBe(126);
    expect(massiveNumber(recordValue(ticker, "day"), "v")).toBe(250000);
  });
});
