import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import { calculateMarketStructure } from "./v3";

const denseHistory = Array.from({ length: 10_000 }, (_, index) => {
  const close = 100 + index * 0.002 + Math.sin(index * 1.7) * 5 + Math.cos(index * 0.13) * 12;
  return { timestamp: new Date(Date.UTC(1999, 0, 22) + index * 86_400_000).toISOString(), open: close - 0.1, high: close + 0.8, low: close - 0.9, close, volume: 1000 + index };
});
// Full-result golden hashes are captured from the audited pre-optimization
// implementation at a0f8668, including events, confirmation times and confidence.
const cases = [
  { count: 1000, options: {}, hash: "f0a1f13a4aa83653e6efd81d9be96d8be799a64ff31fabbdced2e3bce257bc88" },
  { count: 2500, options: {}, hash: "6cdbe0583f9a74399d1e9f46636b065f84bdaf3eb5a0b65a7e5cb411171c6a83" },
  { count: 5000, options: {}, hash: "80877b867f0b57d572a6a9ef85364db7f4a75dcbbb722c355cbd6d7de4f33ec4" },
  { count: 10000, options: {}, hash: "5c90ea4f614b6fe9404c11c3fe6606f592a972c4be727c1be54111c5e06e19af" },
  { count: 10000, options: { minorWidth: 1, majorWidth: 6 }, hash: "a8641aca72ad40be2c34876f46a2ef480875c181a00e48f0efdd84087511919f" },
  { count: 10000, options: { asOfIndex: 4999 }, hash: "80877b867f0b57d572a6a9ef85364db7f4a75dcbbb722c355cbd6d7de4f33ec4" },
];
describe("Market structure dense-history equivalence", () => {
  it.each(cases)("preserves the pre-optimization result: $count bars, $options", ({ count, options, hash }) => {
    const started = performance.now();
    const result = calculateMarketStructure(denseHistory.slice(0, count), options);
    const actual = createHash("sha256").update(JSON.stringify(result)).digest("hex");
    console.log(JSON.stringify({ benchmark: "dense-market-structure-equivalence", count, options, ms: performance.now() - started, swings: result.swings.length, hash: actual }));
    expect(actual).toBe(hash);
  });
});
