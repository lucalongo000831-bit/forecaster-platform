// @vitest-environment jsdom
import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { useMarketSearch } from "./use-market-search";

afterEach(() => { cleanup(); vi.unstubAllGlobals(); });
it("inline empty initial results do not cause a render loop while typing", async () => {
  let renders = 0;
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, json: async () => ({ data: [] }) }));
  const hook = renderHook(({ query }) => {
    if (++renders > 30) throw new Error("Search exceeded 30 renders without input");
    return useMarketSearch(query, []);
  }, { initialProps: { query: "" } });
  await act(async () => { hook.rerender({ query: "NVDA" }); });
  await waitFor(() => expect(fetch).toHaveBeenCalledTimes(1));
  expect(renders).toBeLessThan(15);
});
