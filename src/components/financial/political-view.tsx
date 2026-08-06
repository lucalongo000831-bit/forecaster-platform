"use client";

import { useMemo, useState } from "react";
import { PlayCircle } from "lucide-react";
import { PoliticalChart } from "@/components/charts/market-charts";
import { PoliticalTable } from "@/components/financial/financial-tables";
import type { PoliticalData } from "@/types";

export function PoliticalView({ data }: { data: PoliticalData }) {
  const [type, setType] = useState("All Types");
  const [trade, setTrade] = useState("All Trades");
  const filteredTrades = useMemo(() => data.trades.filter((row) => {
    const matchesRole = type === "All Types" || (type === "Representatives" && row.role === "Representative") || (type === "Senators" && row.role === "Senator");
    const matchesTrade = trade === "All Trades" || row.type === trade.toUpperCase();
    return matchesRole && matchesTrade;
  }), [data.trades, trade, type]);
  return <div className="container-shell page-stack"><section><PoliticalChart data={data.chartSeries}/><div className="mt-5 flex flex-wrap gap-3"><select value={type} onChange={(event) => setType(event.target.value)} className="button-outline"><option>All Types</option><option>Representatives</option><option>Senators</option></select><select value={trade} onChange={(event) => setTrade(event.target.value)} className="button-outline"><option>All Trades</option><option>Buy</option><option>Sell</option></select><button className="button-soft"><PlayCircle/>Political Trades Full Course</button></div></section><section><div className="section-row"><span className="section-pill">Political Transactions</span><span className="muted">Showing {type} · {trade}</span></div><PoliticalTable trades={filteredTrades}/></section></div>;
}
