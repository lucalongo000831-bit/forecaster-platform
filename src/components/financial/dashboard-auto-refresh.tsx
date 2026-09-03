"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";

export const DASHBOARD_REFRESH_INTERVAL_MS = 30_000;
export const DASHBOARD_HIDDEN_REFRESH_INTERVAL_MS = 120_000;
export const DASHBOARD_REFRESH_PROBE_TIMEOUT_MS = 5_000;

const REFRESH_PROBE_PATH = "/api/health/live";

function canRefreshFrom(response: Response) {
  return response.status === 204 && !response.redirected && response.type !== "opaqueredirect";
}

export function DashboardAutoRefresh({ refreshVersion }: { refreshVersion: number }) {
  const router = useRouter();
  useEffect(() => {
    let active = true;
    let requestPending = false;
    let routeRefreshPending = false;
    let timer: number | undefined;
    let controller: AbortController | undefined;

    const schedule = () => {
      window.clearTimeout(timer);
      if (!active || routeRefreshPending) return;
      timer = window.setTimeout(
        () => void refresh(),
        document.hidden ? DASHBOARD_HIDDEN_REFRESH_INTERVAL_MS : DASHBOARD_REFRESH_INTERVAL_MS,
      );
    };

    const refresh = async () => {
      if (!active || requestPending || routeRefreshPending) return;
      if (document.hidden || !navigator.onLine) { schedule(); return; }

      requestPending = true;
      controller = new AbortController();
      const probeTimeout = window.setTimeout(() => controller?.abort(), DASHBOARD_REFRESH_PROBE_TIMEOUT_MS);
      try {
        const response = await fetch(REFRESH_PROBE_PATH, {
          cache: "no-store",
          credentials: "same-origin",
          redirect: "manual",
          signal: controller.signal,
        });
        if (!active || !canRefreshFrom(response)) return;

        // router.refresh() has no completion promise. Keep the gate closed until
        // the server render supplies a new refreshVersion and restarts this effect.
        routeRefreshPending = true;
        router.refresh();
      } catch {
        // Keep the last complete render on transient network/auth gateway errors.
      } finally {
        window.clearTimeout(probeTimeout);
        requestPending = false;
        controller = undefined;
        if (!routeRefreshPending) schedule();
      }
    };

    const onConnectivityChange = () => {
      if (document.hidden || !navigator.onLine || requestPending || routeRefreshPending) return;
      window.clearTimeout(timer);
      void refresh();
    };

    schedule();
    document.addEventListener("visibilitychange", onConnectivityChange);
    window.addEventListener("online", onConnectivityChange);
    return () => {
      active = false;
      window.clearTimeout(timer);
      controller?.abort();
      document.removeEventListener("visibilitychange", onConnectivityChange);
      window.removeEventListener("online", onConnectivityChange);
    };
  }, [refreshVersion, router]);
  return null;
}
