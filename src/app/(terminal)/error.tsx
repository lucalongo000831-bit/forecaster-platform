"use client";

import { AlertTriangle, RotateCcw } from "lucide-react";

export default function TerminalError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return <div className="container-shell grid min-h-[60vh] place-items-center"><div className="soft-card max-w-xl p-10 text-center"><AlertTriangle className="mx-auto text-amber-500" size={42}/><h2 className="mt-4 text-2xl font-bold">Market data temporarily unavailable</h2><p className="muted mt-3">The provider did not respond and no safe fallback could be loaded.</p><button className="button-primary mt-6" onClick={reset}><RotateCcw size={17}/>Retry</button></div></div>;
}
