import { describe, expect, it, vi } from "vitest";
import { providerCached } from "./cache";
import { providerResult } from "./metadata";

describe("provider stale-while-revalidate cache", () => {
  it("coalesces concurrent misses and marks subsequent fresh reads as cached", async () => {
    const key = `test:${crypto.randomUUID()}`;
    let release: (() => void) | undefined;
    const loader = vi.fn(async () => { await new Promise<void>((resolve) => { release = resolve; }); return providerResult("massive", { price: 100 }, { freshness: "realtime", freshnessType: "NEAR_REALTIME" }); });
    const first = providerCached(key, { freshSeconds: 60, staleSeconds: 60 }, loader);
    const second = providerCached(key, { freshSeconds: 60, staleSeconds: 60 }, loader);
    await Promise.resolve(); release?.();
    await expect(Promise.all([first, second])).resolves.toHaveLength(2);
    expect(loader).toHaveBeenCalledTimes(1);
    const cached = await providerCached(key, { freshSeconds: 60, staleSeconds: 60 }, loader);
    expect(cached.meta.freshnessType).toBe("CACHED");
    expect(loader).toHaveBeenCalledTimes(1);
  });

  it("serves a stale observation immediately while refreshing in background", async () => {
    const key = `test:${crypto.randomUUID()}`; const loader = vi.fn(async () => providerResult("fmp", { value: 1 }));
    await providerCached(key, { freshSeconds: 0, staleSeconds: 30 }, loader);
    const stale = await providerCached(key, { freshSeconds: 0, staleSeconds: 30 }, loader);
    expect(stale.meta.freshnessType).toBe("STALE");
  });
});
