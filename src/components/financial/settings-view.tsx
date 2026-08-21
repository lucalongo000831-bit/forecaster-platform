"use client";

import Link from "next/link";
import { Bell, FileText, LogOut, Palette, RefreshCw, ShieldCheck, UserRound } from "lucide-react";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { Switch } from "@/components/ui/interactive-controls";
import type { AccountUser } from "@/types";

type Envelope<T> = { data?: T; error?: { message?: string } };

export type SessionViewState =
  | { status: "CHECKING" }
  | { status: "AUTHENTICATED"; user: AccountUser }
  | { status: "UNAUTHENTICATED" }
  | { status: "UNAVAILABLE"; message: string };

export const SESSION_REQUEST_TIMEOUT_MS = 7_000;

function isAccountUser(value: unknown): value is AccountUser {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Partial<AccountUser>;
  return typeof candidate.id === "string"
    && typeof candidate.email === "string"
    && (candidate.name === null || typeof candidate.name === "string")
    && (candidate.role === "USER" || candidate.role === "ADMIN");
}

function unavailableMessage(error: unknown): string {
  if (error instanceof Error && error.message.trim()) return error.message;
  return "The secure session service did not return a valid response.";
}

export function SettingsView() {
  const router = useRouter();
  const [session, setSession] = useState<SessionViewState>({ status: "CHECKING" });
  const [actionMessage, setActionMessage] = useState("");
  const [promoting, setPromoting] = useState(false);
  const activeRequest = useRef<AbortController | null>(null);
  const requestVersion = useRef(0);

  const checkSession = useCallback(async () => {
    activeRequest.current?.abort();
    const controller = new AbortController();
    const version = ++requestVersion.current;
    let timedOut = false;
    let timeout: number | undefined;
    activeRequest.current = controller;
    setSession({ status: "CHECKING" });

    try {
      const request = fetch("/api/auth/session", {
        cache: "no-store",
        signal: controller.signal,
      });
      const deadline = new Promise<never>((_, reject) => {
        timeout = window.setTimeout(() => {
          timedOut = true;
          controller.abort();
          reject(new Error("The secure session check timed out. Please retry."));
        }, SESSION_REQUEST_TIMEOUT_MS);
      });
      const response = await Promise.race([request, deadline]);

      if (response.status === 401) {
        if (version === requestVersion.current) setSession({ status: "UNAUTHENTICATED" });
        return;
      }

      let body: Envelope<unknown>;
      try {
        body = await response.json() as Envelope<unknown>;
      } catch {
        throw new Error("The secure session service returned an invalid response.");
      }

      if (!response.ok) {
        throw new Error(body.error?.message ?? `Session request failed (${response.status}).`);
      }

      if (body.data === null || body.data === undefined) {
        if (version === requestVersion.current) setSession({ status: "UNAUTHENTICATED" });
        return;
      }

      if (!isAccountUser(body.data)) {
        throw new Error("The secure session service returned an invalid account.");
      }

      if (version === requestVersion.current) setSession({ status: "AUTHENTICATED", user: body.data });
    } catch (error) {
      if (version !== requestVersion.current) return;
      if (controller.signal.aborted && !timedOut) return;
      setSession({
        status: "UNAVAILABLE",
        message: timedOut
          ? "The secure session check timed out. Please retry."
          : unavailableMessage(error),
      });
    } finally {
      if (timeout !== undefined) window.clearTimeout(timeout);
      if (version === requestVersion.current) activeRequest.current = null;
    }
  }, []);

  useEffect(() => {
    const startRequest = window.setTimeout(() => void checkSession(), 0);
    return () => {
      window.clearTimeout(startRequest);
      requestVersion.current += 1;
      activeRequest.current?.abort();
      activeRequest.current = null;
    };
  }, [checkSession]);

  async function logout() {
    const response = await fetch("/api/auth/logout", { method: "POST" });
    if (response.ok) {
      router.push("/login");
      router.refresh();
    }
  }

  async function activateAdministrator() {
    if (session.status !== "AUTHENTICATED") return;
    setPromoting(true);
    setActionMessage("");
    try {
      const response = await fetch("/api/auth/bootstrap-admin", { method: "POST" });
      const body = await response.json() as Envelope<{ user: AccountUser }>;
      if (!response.ok || !body.data?.user) throw new Error(body.error?.message ?? "Administrator activation unavailable");
      setSession({ status: "AUTHENTICATED", user: body.data.user });
      setActionMessage("Administrator access activated securely.");
      router.refresh();
    } catch (error) {
      setActionMessage(error instanceof Error ? error.message : "Administrator activation unavailable");
    } finally {
      setPromoting(false);
    }
  }

  const user = session.status === "AUTHENTICATED" ? session.user : null;

  return (
    <div className="container-shell page-stack">
      <header>
        <span className="page-kicker">Workspace / Account</span>
        <h1 className="page-title">Make Kairo yours.</h1>
        <p className="muted mt-3">Identity, security and local display preferences.</p>
      </header>
      <section className="settings-layout grid gap-5 lg:grid-cols-[240px_1fr]">
        <nav className="card h-fit p-3">
          <button className="settings-nav active"><UserRound/>Profile</button>
          <button className="settings-nav"><Palette/>Appearance</button>
          <Link href="/alerts" className="settings-nav"><Bell/>Notifications</Link>
          <Link href="/preferences/global-market-brief" className="settings-nav"><FileText/>Global brief editor</Link>
        </nav>
        <div className="card p-6 md:p-8">
          <span className="page-kicker">Private identity</span>
          <h2 className="mt-2 text-2xl font-bold">Account settings</h2>

          {session.status === "CHECKING" && <p className="muted mt-6" role="status">Checking secure session…</p>}

          {session.status === "UNAUTHENTICATED" && (
            <div className="soft-card mt-6 p-5">
              <strong>No active session</strong>
              <p className="muted mt-2">Sign in to access persistent watchlists, portfolios, alerts and private backtests.</p>
              <Link href="/login" className="button-primary mt-4 inline-flex">Sign in</Link>
            </div>
          )}

          {session.status === "UNAVAILABLE" && (
            <div className="soft-card mt-6 p-5" role="alert">
              <strong>Session status unavailable</strong>
              <p className="muted mt-2">{session.message}</p>
              <div className="mt-4 flex flex-wrap gap-3">
                <button className="button-primary" onClick={() => void checkSession()}><RefreshCw size={17}/>Retry</button>
                <Link href="/login" className="button-secondary inline-flex">Sign in</Link>
              </div>
            </div>
          )}

          {actionMessage && <p className="mt-6" role="status">{actionMessage}</p>}

          {user && (
            <>
              <div className="settings-fields mt-6 grid-2">
                <label>Name<input value={user.name ?? ""} readOnly/></label>
                <label>Role<input value={user.role} readOnly/></label>
                <label className="md:col-span-2">Email<input type="email" value={user.email} readOnly/></label>
              </div>
              <div className="soft-card mt-6 flex items-start gap-3 p-4">
                <ShieldCheck className="positive"/>
                <div>
                  <strong>Server-side session</strong>
                  <p className="muted mt-1 text-xs">The browser stores only an HttpOnly session token. Authorization and ownership checks run on the server.</p>
                </div>
              </div>
              {user.role === "USER" && (
                <div className="soft-card mt-4 p-4">
                  <strong>Administrator bootstrap</strong>
                  <p className="muted mt-1 text-xs">Available only to the server-authorized account and only while no administrator exists.</p>
                  <button className="button-primary mt-4" disabled={promoting} onClick={() => void activateAdministrator()}>
                    <ShieldCheck size={17}/>{promoting ? "Activating…" : "Activate administrator access"}
                  </button>
                </div>
              )}
              <button className="button-secondary mt-7" onClick={() => void logout()}><LogOut size={17}/>Sign out</button>
            </>
          )}

          <div className="mt-8 border-t border-slate-200 pt-6">
            <h3 className="font-bold">Display preferences</h3>
            <p className="muted mt-1 text-xs">These interface-only preferences remain local to this browser.</p>
            <div className="mt-5 grid gap-4">
              <Switch label="Compact financial tables"/>
              <Switch label="Reduced motion"/>
              <Switch label="High-contrast chart labels"/>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
