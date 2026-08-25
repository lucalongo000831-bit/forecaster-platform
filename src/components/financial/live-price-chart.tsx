"use client";

import { useState } from "react";
import { MainPriceChart } from "@/components/charts/lightweight/lightweight-financial-charts";
import { RangeControls } from "@/components/ui/interactive-controls";
import type { ChartRange, ChartResponse, TimePoint } from "@/types";
import { DataError, DataUnavailable } from "./data-state";
import { formatDataSource } from "@/lib";

const ranges: ChartRange[] = ["1D", "5D", "1M", "3M", "6M", "YTD", "1Y", "5Y", "10Y", "MAX"];

export function LivePriceChart({ symbol, initialData, referenceValue, initialSource = "calculated" }: { symbol: string; initialData: TimePoint[]; referenceValue: number; initialSource?: string }) {
  const [range, setRange] = useState<ChartRange>("MAX");
  const [data, setData] = useState(initialData);
  const [source, setSource] = useState(initialSource);
  const [delayed, setDelayed] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function changeRange(next: string) {
    const selected = next as ChartRange;
    setRange(selected); setLoading(true); setError("");
    for (let attempt = 0; attempt < 2; attempt += 1) {
      try {
        const response = await fetch(`/api/market/chart?symbol=${encodeURIComponent(symbol)}&range=${selected}`);
        const body = await response.json() as ChartResponse | { error?: { message?: string } };
        if (!response.ok || !("data" in body)) throw new Error("error" in body ? body.error?.message : "Grafico non disponibile");
        setData(body.data.points.map((point) => ({ label: point.timestamp.slice(0, 16).replace("T", " "), value: point.close, volume: point.volume })));
        setSource(body.meta.source); setDelayed(body.data.isDelayed); setLoading(false);
        return;
      } catch (requestError) {
        if (attempt === 1) setError(requestError instanceof Error ? requestError.message : "Grafico temporaneamente non disponibile.");
      }
    }
    setLoading(false);
  }

  return <section><div className="section-row"><div><span className="section-pill">Interactive Price Chart</span><p className="muted mt-3">OHLCV history · <strong>{formatDataSource(source, delayed)}</strong></p></div><RangeControls ranges={ranges} initial="MAX" value={range} onChange={changeRange} disabled={loading}/></div>{error && <DataError message={error}/>} {!error && !data.length ? <DataUnavailable detail="No valid OHLCV points were returned for this period."/> : <div className={loading ? "opacity-50 transition-opacity" : "transition-opacity"}><MainPriceChart data={data} referenceValue={referenceValue}/></div>}</section>;
}
