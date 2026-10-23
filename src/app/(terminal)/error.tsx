"use client";

import { AlertTriangle, RotateCcw } from "lucide-react";
import Link from "next/link";
import { useTransition } from "react";

export default function TerminalError({ retry }: { error: Error & { digest?: string }; retry: () => void }) {
  const [pending, startTransition] = useTransition();
  return <div className="container-shell grid min-h-[60vh] place-items-center"><div className="soft-card max-w-xl p-10 text-center"><AlertTriangle className="mx-auto text-amber-500" size={42}/><h2 className="mt-4 text-2xl font-bold">Page temporarily unavailable</h2><p className="muted mt-3">The connection was interrupted or a data source is unavailable. Try again when the connection has recovered.</p><button className="button-primary mt-6" disabled={pending} onClick={() => startTransition(retry)}><RotateCcw size={17}/>{pending ? "Retrying…" : "Retry"}</button><Link className="button-outline mt-3" href="/watchlists">Open watchlists</Link></div></div>;
}
