import { describe, expect, it } from "vitest";
import { horizontalRayDrawingSegment, rectangleDrawingSegments, TECHNICAL_DRAWING_REGISTRY } from "./drawing-registry";

const left = { timestamp: "2025-01-01T00:00:00.000Z", price: 100 };
const right = { timestamp: "2025-01-10T00:00:00.000Z", price: 120 };

describe("Technical V2 drawing geometry", () => {
  it("registers every supported V2 drawing with a deterministic anchor count", () => {
    expect(TECHNICAL_DRAWING_REGISTRY.map(({ id, anchors }) => [id, anchors])).toEqual([
      ["horizontal", 1], ["trend", 2], ["horizontal-ray", 1], ["vertical", 1], ["rectangle", 2],
      ["fib-retracement", 2], ["fib-extension", 3], ["text", 1], ["anchored-vwap", 1],
    ]);
  });

  it("builds all four rectangle edges for normal and reverse anchor order", () => {
    const expectedCorners = new Set([`${left.timestamp}:100`, `${right.timestamp}:100`, `${right.timestamp}:120`, `${left.timestamp}:120`]);
    for (const segments of [rectangleDrawingSegments(left, right), rectangleDrawingSegments(right, left)]) {
      expect(segments).toHaveLength(4);
      expect(segments.every((segment) => segment.length === 2)).toBe(true);
      expect(new Set(segments.flat().map((point) => `${point.timestamp}:${point.price}`))).toEqual(expectedCorners);
    }
  });

  it("extends a horizontal ray only to the right of its anchor", () => {
    const normal = horizontalRayDrawingSegment(left, right.timestamp);
    expect(normal).toEqual([left, { timestamp: right.timestamp, price: left.price }]);
    const afterDataset = horizontalRayDrawingSegment(right, left.timestamp);
    expect(Date.parse(afterDataset[1].timestamp)).toBeGreaterThan(Date.parse(right.timestamp));
    expect(afterDataset[1].price).toBe(right.price);
  });
});
