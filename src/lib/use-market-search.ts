"use client";

import { useEffect, useState } from "react";
import type { SearchInstrument, SearchResponse } from "@/types";

export function useMarketSearch(query: string, initial: SearchInstrument[]) {
  const [results, setResults] = useState(initial);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    const normalized = query.trim();
    if (normalized.length < 2) return;
    const controller = new AbortController();
    const timer = window.setTimeout(async () => {
      setLoading(true); setError("");
      for (let attempt = 0; attempt < 2; attempt += 1) {
        try {
          const response = await fetch(`/api/market/search?q=${encodeURIComponent(normalized)}`, { signal: controller.signal });
          const body = await response.json() as SearchResponse | { error?: { message?: string } };
          if (!response.ok || !("data" in body)) throw new Error("error" in body ? body.error?.message : "Ricerca non disponibile");
          setResults(body.data);
          setLoading(false);
          return;
        } catch (requestError) {
          if (controller.signal.aborted) return;
          if (attempt === 1) setError(requestError instanceof Error && requestError.message !== "error" ? requestError.message : "Ricerca temporaneamente non disponibile.");
        }
      }
      setLoading(false);
    }, 320);
    return () => { window.clearTimeout(timer); controller.abort(); };
  }, [initial, query]);

  const idle = query.trim().length < 2;
  return { results: idle ? initial : results, loading: idle ? false : loading, error: idle ? "" : error };
}
