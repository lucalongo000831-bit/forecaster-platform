"use client";

import { useEffect, useState } from "react";
import { SEASONALITY_HISTORICAL_WINDOWS, type SeasonalityAnalysis } from "@/engines/seasonality";
import type { ApiSuccess } from "@/types";
import { DataError } from "./data-state";
import { SeasonalityExplorer } from "./seasonality-explorer";

const memoryCache = new Map<string, SeasonalityAnalysis>();
const pending = new Map<string, Promise<SeasonalityAnalysis>>();

function requestUrl(symbol: string) {
  const params = new URLSearchParams({
    symbol,
    windows: SEASONALITY_HISTORICAL_WINDOWS.join(","),
    rangeStart: "01-01",
    rangeEnd: "12-31",
    side: "LONG",
    includeCycles: "true",
    includeCorrelations: "true",
    includeTradeStats: "true",
    includeTable: "true",
  });
  return `/api/analysis/seasonality?${params.toString()}`;
}

async function loadAnalysis(symbol: string) {
  const cached = memoryCache.get(symbol);
  if (cached) return cached;
  const active = pending.get(symbol);
  if (active) return active;
  const task = (async () => {
    let lastError: Error | null = null;
    for (let attempt = 0; attempt < 2; attempt += 1) {
      try {
        const response = await fetch(requestUrl(symbol));
        const body = await response.json() as ApiSuccess<SeasonalityAnalysis> | { error?: { message?: string } };
        if (!response.ok || !("data" in body)) throw new Error("error" in body ? body.error?.message : "Seasonality unavailable");
        memoryCache.set(symbol, body.data);
        return body.data;
      } catch (error) {
        lastError = error instanceof Error ? error : new Error("Seasonality temporarily unavailable.");
        if (attempt === 0) await new Promise((resolve) => window.setTimeout(resolve, 250));
      }
    }
    throw lastError ?? new Error("Seasonality temporarily unavailable.");
  })().finally(() => pending.delete(symbol));
  pending.set(symbol, task);
  return task;
}

export function prefetchSeasonalityAnalysis(symbol: string) {
  void loadAnalysis(symbol.toUpperCase()).catch(() => undefined);
}

export function SeasonalityExplorerLoader({ symbol }: { symbol: string }) {
  const normalized = symbol.toUpperCase();
  const [analysis, setAnalysis] = useState<SeasonalityAnalysis | null>(() => memoryCache.get(normalized) ?? null);
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;
    const cached = memoryCache.get(normalized);
    if (cached) {
      queueMicrotask(() => {
        if (active) { setAnalysis(cached); setError(""); }
      });
      return () => { active = false; };
    }
    queueMicrotask(() => {
      if (active) { setAnalysis(null); setError(""); }
    });
    void loadAnalysis(normalized).then((result) => {
      if (active) setAnalysis(result);
    }).catch((requestError) => {
      if (active) setError(requestError instanceof Error ? requestError.message : "Seasonality temporarily unavailable.");
    });
    return () => { active = false; };
  }, [normalized]);

  if (analysis?.symbol === normalized) return <SeasonalityExplorer symbol={normalized} initial={analysis}/>;
  return <div className="container-shell page-stack" aria-label="Loading seasonality analysis" aria-busy={!error}>
    <header><span className="page-kicker">Historical research / seasonality-v2.0.0</span><div className="mt-3 h-12 w-full max-w-xl animate-pulse rounded-xl bg-slate-200"/><div className="mt-4 h-5 w-full max-w-3xl animate-pulse rounded-lg bg-slate-100"/></header>
    {error ? <DataError message={error}/> : <>
      <div className="soft-card grid gap-4 p-5 sm:grid-cols-2 xl:grid-cols-5">{Array.from({ length: 5 }, (_, index) => <div className="space-y-3" key={index}><div className="h-3 w-20 animate-pulse rounded bg-slate-200"/><div className="h-5 w-28 animate-pulse rounded bg-slate-100"/></div>)}</div>
      <div className="soft-card h-96 animate-pulse"/>
    </>}
  </div>;
}
