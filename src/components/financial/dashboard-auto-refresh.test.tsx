// @vitest-environment jsdom

import { act, cleanup, render } from "@testing-library/react";
import { StrictMode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  DASHBOARD_HIDDEN_REFRESH_INTERVAL_MS,
  DASHBOARD_REFRESH_INTERVAL_MS,
  DASHBOARD_REFRESH_PROBE_TIMEOUT_MS,
  DASHBOARD_ROUTE_REFRESH_SETTLE_TIMEOUT_MS,
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

    await act(async () => { await vi.advanceTimersByTimeAsync(DASHBOARD_ROUTE_REFRESH_SETTLE_TIMEOUT_MS - 1); });
    expect(request).toHaveBeenCalledTimes(1);
    expect(router.refresh).toHaveBeenCalledTimes(1);

    view.rerender(<DashboardAutoRefresh refreshVersion={2}/>);
    await act(async () => { await vi.advanceTimersByTimeAsync(DASHBOARD_REFRESH_INTERVAL_MS); });
    expect(router.refresh).toHaveBeenCalledTimes(2);
  });

  it("releases the route gate when refresh returns the same server version", async () => {
    vi.useFakeTimers();
    const request = vi.spyOn(globalThis, "fetch").mockResolvedValue(liveResponse());
    render(<DashboardAutoRefresh refreshVersion={1}/>);

    await act(async () => { await vi.advanceTimersByTimeAsync(DASHBOARD_REFRESH_INTERVAL_MS); });
    expect(request).toHaveBeenCalledTimes(1);
    expect(router.refresh).toHaveBeenCalledTimes(1);

    await act(async () => {
      window.dispatchEvent(new Event("online"));
      await vi.advanceTimersByTimeAsync(DASHBOARD_ROUTE_REFRESH_SETTLE_TIMEOUT_MS - 1);
    });
    expect(request).toHaveBeenCalledTimes(1);

    await act(async () => { await vi.advanceTimersByTimeAsync(1 + DASHBOARD_REFRESH_INTERVAL_MS); });
    expect(request).toHaveBeenCalledTimes(2);
    expect(router.refresh).toHaveBeenCalledTimes(2);
  });

  it.each([302, 307, 308, 401, 403, 500])("keeps the current render on HTTP %i", async (status) => {
    vi.useFakeTimers();
    vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(null, { status }));
    render(<DashboardAutoRefresh refreshVersion={1}/>);

    await act(async () => { await vi.advanceTimersByTimeAsync(DASHBOARD_REFRESH_INTERVAL_MS * 6); });

    expect(router.refresh).not.toHaveBeenCalled();
  });

  it.each([
    ["SSO HTML", new Response("<html>Sign in</html>", { status: 200, headers: { "Content-Type": "text/html" } })],
    ["unexpected JSON", new Response("{}", { status: 200, headers: { "Content-Type": "application/json" } })],
    ["opaque redirect", { status: 0, redirected: false, type: "opaqueredirect" } as Response],
  ])("keeps the current render on %s", async (_label, response) => {
    vi.useFakeTimers();
    vi.spyOn(globalThis, "fetch").mockResolvedValue(response);
    render(<DashboardAutoRefresh refreshVersion={1}/>);

    await act(async () => { await vi.advanceTimersByTimeAsync(DASHBOARD_REFRESH_INTERVAL_MS * 3); });

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

  it("recovers after a network error, timeout, and malformed response without a reload", async () => {
    vi.useFakeTimers();
    const request = vi.spyOn(globalThis, "fetch")
      .mockRejectedValueOnce(new TypeError("offline"))
      .mockImplementationOnce((_input, init) => new Promise((_resolve, reject) => {
        init?.signal?.addEventListener("abort", () => reject(new DOMException("Aborted", "AbortError")), { once: true });
      }))
      .mockResolvedValueOnce(null as unknown as Response)
      .mockResolvedValueOnce(liveResponse());
    render(<DashboardAutoRefresh refreshVersion={1}/>);

    await act(async () => { await vi.advanceTimersByTimeAsync(DASHBOARD_REFRESH_INTERVAL_MS); });
    await act(async () => { await vi.advanceTimersByTimeAsync(DASHBOARD_REFRESH_INTERVAL_MS + DASHBOARD_REFRESH_PROBE_TIMEOUT_MS); });
    await act(async () => { await vi.advanceTimersByTimeAsync(DASHBOARD_REFRESH_INTERVAL_MS); });
    await act(async () => { await vi.advanceTimersByTimeAsync(DASHBOARD_REFRESH_INTERVAL_MS); });

    expect(request).toHaveBeenCalledTimes(4);
    expect(router.refresh).toHaveBeenCalledTimes(1);
  });

  it("keeps probes single-flight during interval and reconnect event pressure", async () => {
    vi.useFakeTimers();
    let complete: ((response: Response) => void) | undefined;
    let activeRequests = 0;
    let maximumActiveRequests = 0;
    const request = vi.spyOn(globalThis, "fetch").mockImplementation(() => {
      activeRequests += 1;
      maximumActiveRequests = Math.max(maximumActiveRequests, activeRequests);
      return new Promise<Response>((resolve) => {
        complete = (response) => {
          activeRequests -= 1;
          resolve(response);
        };
      });
    });
    render(<DashboardAutoRefresh refreshVersion={1}/>);

    await act(async () => { await vi.advanceTimersByTimeAsync(DASHBOARD_REFRESH_INTERVAL_MS); });
    await act(async () => {
      document.dispatchEvent(new Event("visibilitychange"));
      window.dispatchEvent(new Event("online"));
      await vi.advanceTimersByTimeAsync(DASHBOARD_REFRESH_PROBE_TIMEOUT_MS - 1);
    });

    expect(request).toHaveBeenCalledTimes(1);
    expect(maximumActiveRequests).toBe(1);

    await act(async () => { complete?.(liveResponse()); });
    expect(router.refresh).toHaveBeenCalledTimes(1);
  });

  it("does no network work while hidden and resumes once when visible", async () => {
    vi.useFakeTimers();
    const hidden = vi.spyOn(document, "hidden", "get").mockReturnValue(true);
    const request = vi.spyOn(globalThis, "fetch").mockResolvedValue(liveResponse());
    render(<DashboardAutoRefresh refreshVersion={1}/>);

    await act(async () => { await vi.advanceTimersByTimeAsync(DASHBOARD_HIDDEN_REFRESH_INTERVAL_MS * 3); });
    expect(request).not.toHaveBeenCalled();

    hidden.mockReturnValue(false);
    await act(async () => {
      document.dispatchEvent(new Event("visibilitychange"));
      window.dispatchEvent(new Event("online"));
    });

    expect(request).toHaveBeenCalledTimes(1);
    expect(router.refresh).toHaveBeenCalledTimes(1);
  });

  it("does no network work while offline and resumes once on reconnect", async () => {
    vi.useFakeTimers();
    const online = vi.spyOn(navigator, "onLine", "get").mockReturnValue(false);
    const request = vi.spyOn(globalThis, "fetch").mockResolvedValue(liveResponse());
    render(<DashboardAutoRefresh refreshVersion={1}/>);

    await act(async () => { await vi.advanceTimersByTimeAsync(DASHBOARD_REFRESH_INTERVAL_MS * 3); });
    expect(request).not.toHaveBeenCalled();

    online.mockReturnValue(true);
    await act(async () => {
      window.dispatchEvent(new Event("online"));
      document.dispatchEvent(new Event("visibilitychange"));
    });

    expect(request).toHaveBeenCalledTimes(1);
    expect(router.refresh).toHaveBeenCalledTimes(1);
  });

  it("aborts and removes the old scheduler on unmount, then mounts exactly one replacement", async () => {
    vi.useFakeTimers();
    let firstSignal: AbortSignal | undefined;
    const request = vi.spyOn(globalThis, "fetch").mockImplementationOnce((_input, init) => {
      firstSignal = init?.signal ?? undefined;
      return new Promise((_resolve, reject) => {
        firstSignal?.addEventListener("abort", () => reject(new DOMException("Aborted", "AbortError")), { once: true });
      });
    }).mockResolvedValue(liveResponse());
    const view = render(<DashboardAutoRefresh refreshVersion={1}/>);

    await act(async () => { await vi.advanceTimersByTimeAsync(DASHBOARD_REFRESH_INTERVAL_MS); });
    expect(request).toHaveBeenCalledTimes(1);
    view.unmount();
    expect(firstSignal?.aborted).toBe(true);
    await act(async () => { await vi.advanceTimersByTimeAsync(DASHBOARD_REFRESH_INTERVAL_MS * 3); });
    expect(request).toHaveBeenCalledTimes(1);

    render(<DashboardAutoRefresh refreshVersion={2}/>);
    await act(async () => { await vi.advanceTimersByTimeAsync(DASHBOARD_REFRESH_INTERVAL_MS); });
    expect(request).toHaveBeenCalledTimes(2);
    expect(router.refresh).toHaveBeenCalledTimes(1);
  });

  it("mounts a single scheduler under React Strict Mode", async () => {
    vi.useFakeTimers();
    const request = vi.spyOn(globalThis, "fetch").mockResolvedValue(liveResponse());
    render(<StrictMode><DashboardAutoRefresh refreshVersion={1}/></StrictMode>);

    await act(async () => { await vi.advanceTimersByTimeAsync(DASHBOARD_REFRESH_INTERVAL_MS); });

    expect(request).toHaveBeenCalledTimes(1);
    expect(router.refresh).toHaveBeenCalledTimes(1);
  });

  it("issues exactly twenty non-overlapping probes in a ten-minute-equivalent healthy lifecycle", async () => {
    vi.useFakeTimers();
    let refreshVersion = 1;
    let activeRequests = 0;
    let maximumActiveRequests = 0;
    const request = vi.spyOn(globalThis, "fetch").mockImplementation(async () => {
      activeRequests += 1;
      maximumActiveRequests = Math.max(maximumActiveRequests, activeRequests);
      await Promise.resolve();
      activeRequests -= 1;
      return liveResponse();
    });
    const view = render(<DashboardAutoRefresh refreshVersion={refreshVersion}/>);

    for (let cycle = 0; cycle < 20; cycle += 1) {
      await act(async () => { await vi.advanceTimersByTimeAsync(DASHBOARD_REFRESH_INTERVAL_MS); });
      refreshVersion += 1;
      view.rerender(<DashboardAutoRefresh refreshVersion={refreshVersion}/>);
    }

    expect(request).toHaveBeenCalledTimes(20);
    expect(router.refresh).toHaveBeenCalledTimes(20);
    expect(maximumActiveRequests).toBe(1);
  });
});
