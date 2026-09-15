"use client";

import { useEffect, useMemo, useState } from "react";
import type { SearchInstrument } from "@/types";
import { mergeSearchResults } from "./market-search-results";

const EMPTY: SearchInstrument[] = [];
const searchMemory = new Map<string, SearchInstrument[]>();

export function useMarketSearch(query: string, initial: SearchInstrument[] = EMPTY) {
  // Depend on seed content, not the caller's array identity (including inline []).
  const seedKey = JSON.stringify(initial);
  const seed = useMemo(() => mergeSearchResults([], JSON.parse(seedKey)), [seedKey]);
  const [state, setState] = useState({ query: "", results: seed, loading: false, error: "" });
  const normalized = query.trim();
  const key = normalized.toLocaleLowerCase("en");
  const local = useMemo(() => seed.filter((item) => `${item.symbol} ${item.name} ${item.venue}`.toLocaleLowerCase("en").includes(key)), [seed, key]);

  useEffect(() => {
    if (normalized.length < 2) return;
    let active = true;
    const controller = new AbortController();
    let deadline: number | undefined;
    const timer = window.setTimeout(async () => {
      const cached = searchMemory.get(key);
      if (cached) { setState({ query: key, results: mergeSearchResults(local, cached), loading: false, error: "" }); return; }
      setState({ query: key, results: local, loading: true, error: "" });
      deadline = window.setTimeout(() => controller.abort(), 5_000);
      try {
        const response = await fetch(`/api/market/search?q=${encodeURIComponent(normalized)}`, { signal: controller.signal });
        const body = await response.json();
        if (!response.ok || !Array.isArray(body?.data)) throw new Error("Ricerca temporaneamente non disponibile.");
        const results = mergeSearchResults(local, body.data);
        if (!active) return;
        if (searchMemory.size >= 100) searchMemory.delete(searchMemory.keys().next().value!);
        searchMemory.set(key, results);
        setState({ query: key, results, loading: false, error: "" });
      } catch {
        if (active) setState({ query: key, results: local, loading: false, error: "Ricerca temporaneamente non disponibile. Riprova." });
      } finally { window.clearTimeout(deadline); }
    }, 160);
    return () => { active = false; window.clearTimeout(timer); window.clearTimeout(deadline); controller.abort(); };
  }, [key, local, normalized]);

  const idle = normalized.length < 2;
  return idle ? { results: seed, loading: false, error: "" } : state.query === key ? state : { results: local, loading: false, error: "" };
}
