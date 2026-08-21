"use client";

import { useEffect, useState } from "react";
import type { PatternAnalysis } from "@/engines/pattern";
import { DataError } from "./data-state";
import { cachedPatternAnalysis, loadPatternAnalysis } from "./pattern-analysis-client";
import { PatternExplorer } from "./pattern-explorer";

export function PatternExplorerLoader({ symbol }: { symbol: string }) {
  const normalized = symbol.toUpperCase();
  const [analysis, setAnalysis] = useState<PatternAnalysis | null>(() => cachedPatternAnalysis(normalized));
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;
    const cached = cachedPatternAnalysis(normalized);
    if (cached) {
      queueMicrotask(() => { if (active) { setAnalysis(cached); setError(""); } });
      return () => { active = false; };
    }
    queueMicrotask(() => { if (active) { setAnalysis(null); setError(""); } });
    void loadPatternAnalysis(normalized).then((result) => { if (active) setAnalysis(result); }).catch((requestError) => { if (active) setError(requestError instanceof Error ? requestError.message : "Pattern analysis temporarily unavailable."); });
    return () => { active = false; };
  }, [normalized]);

  if (analysis?.symbol === normalized) return <PatternExplorer symbol={normalized} initial={analysis}/>;
  return <div className="container-shell page-stack" aria-label="Loading Pattern V2 analysis" aria-busy={!error}>
    <header><span className="page-kicker">Historical analogue research / pattern-v2.0.0</span><div className="mt-3 h-12 w-full max-w-xl animate-pulse rounded-xl bg-slate-200"/><div className="mt-4 h-5 w-full max-w-3xl animate-pulse rounded-lg bg-slate-100"/></header>
    {error ? <DataError message={error}/> : <><div className="soft-card h-20 animate-pulse"/><div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_280px]"><div className="soft-card h-[540px] animate-pulse"/><div className="grid gap-4"><div className="soft-card h-52 animate-pulse"/><div className="soft-card h-48 animate-pulse"/><div className="soft-card h-64 animate-pulse"/></div></div><div className="soft-card h-72 animate-pulse"/></>}
  </div>;
}
