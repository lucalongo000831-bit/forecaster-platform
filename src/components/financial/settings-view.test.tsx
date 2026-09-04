// @vitest-environment jsdom

import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { StrictMode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { SESSION_REQUEST_TIMEOUT_MS, SettingsView } from "./settings-view";

const router = { push: vi.fn(), refresh: vi.fn() };

vi.mock("next/navigation", () => ({
  useRouter: () => router,
}));

function sessionResponse(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(status >= 400 ? { error: { message: data } } : { data }), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.restoreAllMocks();
  router.push.mockReset();
  router.refresh.mockReset();
});

describe("SettingsView session states", () => {
  it("renders an authenticated session", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(sessionResponse({
      id: "user-1",
      email: "investor@example.com",
      name: "Kairo Investor",
      role: "ADMIN",
    }));

    render(<SettingsView/>);

    expect(await screen.findByDisplayValue("investor@example.com")).toBeVisible();
    expect(screen.getByText("Server-side session")).toBeVisible();
    expect(screen.queryByText("Checking secure session…")).not.toBeInTheDocument();
  });

  it("starts only one session request during a Strict Mode mount cycle", async () => {
    const request = vi.spyOn(globalThis, "fetch").mockResolvedValue(sessionResponse(null));

    render(<StrictMode><SettingsView/></StrictMode>);

    expect(await screen.findByText("No active session")).toBeVisible();
    expect(request).toHaveBeenCalledTimes(1);
  });

  it("distinguishes a successful empty session from an unavailable service", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(sessionResponse(null));

    render(<SettingsView/>);

    expect(await screen.findByText("No active session")).toBeVisible();
    expect(screen.queryByText("Session status unavailable")).not.toBeInTheDocument();
  });

  it("treats HTTP 401 as unauthenticated", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(sessionResponse("Authentication required", 401));

    render(<SettingsView/>);

    expect(await screen.findByText("No active session")).toBeVisible();
  });

  it.each([
    [403, "Forbidden"],
    [500, "Temporary server failure"],
  ])("renders an unavailable state for HTTP %i", async (status, message) => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(sessionResponse(message, status));

    render(<SettingsView/>);

    expect(await screen.findByText("Session status unavailable")).toBeVisible();
    expect(screen.getByText(message)).toBeVisible();
    expect(screen.getByRole("button", { name: "Retry" })).toBeEnabled();
  });

  it("renders an unavailable state for a network failure", async () => {
    vi.spyOn(globalThis, "fetch").mockRejectedValue(new TypeError("Network request failed"));

    render(<SettingsView/>);

    expect(await screen.findByText("Session status unavailable")).toBeVisible();
    expect(screen.getByText("Network request failed")).toBeVisible();
  });

  it("renders an unavailable state for invalid JSON", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response("not-json", { status: 200 }));

    render(<SettingsView/>);

    expect(await screen.findByText("Session status unavailable")).toBeVisible();
    expect(screen.getByText(/invalid response/i)).toBeVisible();
  });

  it("aborts a hanging request at the bounded deadline", async () => {
    vi.useFakeTimers();
    let signal: AbortSignal | undefined;
    vi.spyOn(globalThis, "fetch").mockImplementation((_input, init) => {
      signal = init?.signal ?? undefined;
      return new Promise(() => undefined);
    });

    render(<SettingsView/>);
    expect(screen.getByText("Checking secure session…")).toBeVisible();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(SESSION_REQUEST_TIMEOUT_MS);
    });

    expect(signal?.aborted).toBe(true);
    expect(screen.getByText("Session status unavailable")).toBeVisible();
    expect(screen.getByText(/timed out/i)).toBeVisible();
  });

  it("retries once and recovers without concurrent requests", async () => {
    const request = vi.spyOn(globalThis, "fetch")
      .mockRejectedValueOnce(new TypeError("offline"))
      .mockResolvedValueOnce(sessionResponse(null));

    render(<SettingsView/>);
    expect(await screen.findByText("Session status unavailable")).toBeVisible();

    fireEvent.click(screen.getByRole("button", { name: "Retry" }));

    expect(await screen.findByText("No active session")).toBeVisible();
    expect(request).toHaveBeenCalledTimes(2);
  });

  it("aborts the active request on unmount without updating stale state", async () => {
    let signal: AbortSignal | undefined;
    vi.spyOn(globalThis, "fetch").mockImplementation((_input, init) => {
      signal = init?.signal ?? undefined;
      return new Promise((_resolve, reject) => {
        signal?.addEventListener("abort", () => reject(new DOMException("Aborted", "AbortError")), { once: true });
      });
    });

    const view = render(<SettingsView/>);
    await waitFor(() => expect(signal).toBeDefined());
    view.unmount();

    expect(signal?.aborted).toBe(true);
  });

  it("recognizes a genuinely invalidated session on the next canonical check", async () => {
    const request = vi.spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(sessionResponse({
        id: "user-1",
        email: "investor@example.com",
        name: "Kairo Investor",
        role: "USER",
      }))
      .mockResolvedValueOnce(sessionResponse(null));

    const view = render(<SettingsView/>);
    expect(await screen.findByDisplayValue("investor@example.com")).toBeVisible();
    view.unmount();

    render(<SettingsView/>);
    expect(await screen.findByText("No active session")).toBeVisible();
    expect(request).toHaveBeenCalledTimes(2);
  });

  it("preserves explicit logout and navigates only after server invalidation succeeds", async () => {
    const request = vi.spyOn(globalThis, "fetch").mockImplementation(async (input, init) => {
      if (input === "/api/auth/logout") {
        expect(init).toMatchObject({ method: "POST" });
        return sessionResponse({ loggedOut: true });
      }
      return sessionResponse({
        id: "user-1",
        email: "investor@example.com",
        name: "Kairo Investor",
        role: "USER",
      });
    });

    render(<SettingsView/>);
    expect(await screen.findByDisplayValue("investor@example.com")).toBeVisible();
    fireEvent.click(screen.getByRole("button", { name: "Sign out" }));

    await waitFor(() => expect(router.push).toHaveBeenCalledWith("/login"));
    expect(router.refresh).toHaveBeenCalledTimes(1);
    expect(request).toHaveBeenCalledWith("/api/auth/logout", { method: "POST" });
  });
});
