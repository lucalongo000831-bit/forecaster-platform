import { describe, expect, it } from "vitest";
import type { PatternAnalysis } from "@/engines/pattern";
import { buildPatternChartRows } from "./pattern-v2-chart";

const analysis = {
  historicalObservedPath: [{ observation: 0, date: "2026-01-01", value: -0.1 }, { observation: 1, date: "2026-01-02", value: 0 }],
  mostCorrelated: { normalizedFuturePath: [{ observation: 0, date: null, value: 0 }, { observation: 1, date: "2019-01-03", value: .04 }] },
  averageLong: { points: [{ observation: 0, date: null, value: 0 }, { observation: 1, date: null, value: .03 }] },
  averageShort: { points: [{ observation: 0, date: null, value: 0 }, { observation: 1, date: null, value: -.02 }] },
  matchedEvents: [{ id: "match-a", normalizedFuturePath: [{ observation: 0, date: null, value: 0 }, { observation: 1, date: "2018-01-03", value: .05 }] }],
} as unknown as PatternAnalysis;

describe("Pattern V2 chart projection", () => {
  it("aligns observed history at T0 and every forward analogue after the reference marker", () => {
    const rows = buildPatternChartRows(analysis);
    expect(rows.map((row) => row.horizon)).toEqual([-1, 0, 1]);
    expect(rows[0]).toMatchObject({ observed: -.1, date: "2026-01-01" });
    expect(rows[1]).toMatchObject({ observed: 0, best: 0, averageLong: 0, averageShort: 0, "event_match-a": 0 });
    expect(rows[2]).toMatchObject({ best: .04, averageLong: .03, averageShort: -.02, "event_match-a": .05 });
  });
});
