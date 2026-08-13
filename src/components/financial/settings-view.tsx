"use client";

import Link from "next/link";
import { Bell, FileText, LogOut, Palette, ShieldCheck, UserRound } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { Switch } from "@/components/ui/interactive-controls";
import type { AccountUser } from "@/types";

type Envelope<T> = { data?: T; error?: { message?: string } };
export function SettingsView() {
  const router = useRouter();
  const [user, setUser] = useState<AccountUser | null>(null);
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(true);
  const [promoting, setPromoting] = useState(false);

  useEffect(() => { void (async () => { try { const response = await fetch("/api/auth/session", { cache: "no-store" }); const body = await response.json() as Envelope<AccountUser | null>; if (!response.ok) throw new Error(body.error?.message ?? "Sessione non disponibile"); setUser(body.data ?? null); } catch (error) { setMessage(error instanceof Error ? error.message : "Sessione non disponibile"); } finally { setLoading(false); } })(); }, []);
  async function logout() { const response = await fetch("/api/auth/logout", { method: "POST" }); if (response.ok) { router.push("/login"); router.refresh(); } }
  async function activateAdministrator() {
    setPromoting(true); setMessage("");
    try {
      const response = await fetch("/api/auth/bootstrap-admin", { method: "POST" });
      const body = await response.json() as Envelope<{ user: AccountUser }>;
      if (!response.ok || !body.data?.user) throw new Error(body.error?.message ?? "Administrator activation unavailable");
      setUser(body.data.user); setMessage("Administrator access activated securely."); router.refresh();
    } catch (error) { setMessage(error instanceof Error ? error.message : "Administrator activation unavailable"); }
    finally { setPromoting(false); }
  }

  return <div className="container-shell page-stack"><header><span className="page-kicker">Workspace / Account</span><h1 className="page-title">Make Kairo yours.</h1><p className="muted mt-3">Identity, security and local display preferences.</p></header><section className="settings-layout grid gap-5 lg:grid-cols-[240px_1fr]"><nav className="card h-fit p-3"><button className="settings-nav active"><UserRound/>Profile</button><button className="settings-nav"><Palette/>Appearance</button><Link href="/alerts" className="settings-nav"><Bell/>Notifications</Link><Link href="/preferences/global-market-brief" className="settings-nav"><FileText/>Global brief editor</Link></nav><div className="card p-6 md:p-8"><span className="page-kicker">Private identity</span><h2 className="mt-2 text-2xl font-bold">Account settings</h2>{loading && <p className="muted mt-6">Checking secure session…</p>}{message && <p className="mt-6">{message}</p>}{!loading && !user && <div className="soft-card mt-6 p-5"><strong>No active session</strong><p className="muted mt-2">Sign in to access persistent watchlists, portfolios, alerts and private backtests.</p><Link href="/login" className="button-primary mt-4 inline-flex">Sign in</Link></div>}{user && <><div className="settings-fields mt-6 grid-2"><label>Name<input value={user.name ?? ""} readOnly/></label><label>Role<input value={user.role} readOnly/></label><label className="md:col-span-2">Email<input type="email" value={user.email} readOnly/></label></div><div className="soft-card mt-6 flex items-start gap-3 p-4"><ShieldCheck className="positive"/><div><strong>Server-side session</strong><p className="muted mt-1 text-xs">The browser stores only an HttpOnly session token. Authorization and ownership checks run on the server.</p></div></div>{user.role === "USER" && <div className="soft-card mt-4 p-4"><strong>Administrator bootstrap</strong><p className="muted mt-1 text-xs">Available only to the server-authorized account and only while no administrator exists.</p><button className="button-primary mt-4" disabled={promoting} onClick={() => void activateAdministrator()}><ShieldCheck size={17}/>{promoting ? "Activating…" : "Activate administrator access"}</button></div>}<button className="button-secondary mt-7" onClick={() => void logout()}><LogOut size={17}/>Sign out</button></>}<div className="mt-8 border-t border-slate-200 pt-6"><h3 className="font-bold">Display preferences</h3><p className="muted mt-1 text-xs">These interface-only preferences remain local to this browser.</p><div className="mt-5 grid gap-4"><Switch label="Compact financial tables"/><Switch label="Reduced motion"/><Switch label="High-contrast chart labels"/></div></div></div></section></div>;
}
