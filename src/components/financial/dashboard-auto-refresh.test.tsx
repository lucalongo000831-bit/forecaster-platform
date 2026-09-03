// @vitest-environment jsdom

import { act, cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  DASHBOARD_REFRESH_INTERVAL_MS,
  DASHBOARD_REFRESH_PROBE_TIMEOUT_MS,
  DashboardAutoRefresh,
} from "./dashboard-auto-refresh";

const router = { refresh: vi.fn() };

vi.mock("next/navigation", () => ({
  useRouter: () => router,
}));

function liveResponse() {
  return new Response(null, { status: 204, headers: { "Cache-Control": "no-store" } });
}

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.restoreAllMocks();
  router.refresh.mockReset();
});

describe("DashboardAutoRefresh", () => {
  it("preflights a refresh and waits for the completed server render", async () => {
    vi.useFakeTimers();
    const request = vi.spyOn(globalThis, "fetch").mockResolvedValue(liveResponse());
    const view = render(<DashboardAutoRefresh refreshVersion={1}/>);

    await act(async () => { await vi.advanceTimersByTimeAsync(DASHBOARD_REFRESH_INTERVAL_MS); });

    expect(request).toHaveBeenCalledWith("/api/health/live", expect.objectContaining({
      cache: "no-store",
      credentials: "same-origin",
      redirect: "manual",
    }));
    expect(router.refresh).toHaveBeenCalledTimes(1);

    await act(async () => { await vi.advanceTimersByTimeAsync(DASHBOARD_REFRESH_INTERVAL_MS * 6); });
    expect(request).toHaveBeenCalledTimes(1);
    expect(router.refresh).toHaveBeenCalledTimes(1);

    view.rerender(<DashboardAutoRefresh refreshVersion={2}/>);
    await act(async () => { await vi.advanceTimersByTimeAsync(DASHBOARD_REFRESH_INTERVAL_MS); });
    expect(router.refresh).toHaveBeenCalledTimes(2);
  });

  it.each([302, 401, 403, 500])("keeps the current render on HTTP %i", async (status) => {
    vi.useFakeTimers();
    vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(null, { status }));
    render(<DashboardAutoRefresh refreshVersion={1}/>);

    await act(async () => { await vi.advanceTimersByTimeAsync(DASHBOARD_REFRESH_INTERVAL_MS * 6); });

    expect(router.refresh).not.toHaveBeenCalled();
  });

  it("does not overlap a hanging probe and retries after its deadline", async () => {
    vi.useFakeTimers();
    const request = vi.spyOn(globalThis, "fetch").mockImplementation((_input, init) => new Promise((_resolve, reject) => {
      init?.signal?.addEventListener("abort", () => reject(new DOMException("Aborted", "AbortError")), { once: true });
    }));
    render(<DashboardAutoRefresh refreshVersion={1}/>);

    await act(async () => { await vi.advanceTimersByTimeAsync(DASHBOARD_REFRESH_INTERVAL_MS + DASHBOARD_REFRESH_PROBE_TIMEOUT_MS - 1); });
    expect(request).toHaveBeenCalledTimes(1);

    await act(async () => { await vi.advanceTimersByTimeAsync(1); });
    await act(async () => { await vi.advanceTimersByTimeAsync(DASHBOARD_REFRESH_INTERVAL_MS); });
    expect(request).toHaveBeenCalledTimes(2);
    expect(router.refresh).not.toHaveBeenCalled();
  });

  it("rechecks immediately when a visible tab reconnects", async () => {
    vi.useFakeTimers();
    const request = vi.spyOn(globalThis, "fetch").mockResolvedValue(liveResponse());
    render(<DashboardAutoRefresh refreshVersion={1}/>);

    await act(async () => { window.dispatchEvent(new Event("online")); });

    expect(request).toHaveBeenCalledTimes(1);
    expect(router.refresh).toHaveBeenCalledTimes(1);
  });
});
