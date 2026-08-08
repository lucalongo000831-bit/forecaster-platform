"use client";

import { useMemo, useState } from "react";
import { PoliticalChart } from "@/components/charts/market-charts";
import { PoliticalTable } from "@/components/financial/financial-tables";
import type { PoliticalData } from "@/types";
import { DataUnavailable } from "./data-state";

export function PoliticalView({ data }: { data: PoliticalData }) {
  const [type, setType] = useState("ALL");
  const [trade, setTrade] = useState("ALL");
  const filteredTrades = useMemo(() => data.trades.filter((row) => {
    const matchesRole = type === "ALL" || (type === "HOUSE" && row.role === "Representative") || (type === "SENATE" && row.role === "Senator");
    const matchesTrade = trade === "ALL" || row.type === trade;
    return matchesRole && matchesTrade;
  }), [data.trades, trade, type]);
  return <div className="container-shell page-stack"><section><PoliticalChart data={data.chartSeries}/><div className="mt-5 flex flex-wrap gap-3"><select value={type} onChange={(event) => setType(event.target.value)} className="button-outline"><option value="ALL">ALL</option><option value="HOUSE">HOUSE</option><option value="SENATE">SENATE</option></select><select value={trade} onChange={(event) => setTrade(event.target.value)} className="button-outline"><option value="ALL">ALL TRANSACTIONS</option><option value="BUY">PURCHASE</option><option value="SELL">SALE</option><option value="EXCHANGE">EXCHANGE</option><option value="OTHER">OTHER</option></select></div></section><section><div className="section-row"><span className="section-pill">Political Transactions</span><span className="muted">{data.source === "fmp" ? `FMP · updated ${data.fetchedAt ? new Date(data.fetchedAt).toLocaleString("en-GB") : "recently"}` : "Data unavailable"}</span></div>{filteredTrades.length ? <PoliticalTable trades={filteredTrades}/> : <DataUnavailable title="Political transactions unavailable" detail="No House or Senate disclosure was returned by FMP for this symbol and filter."/>}</section></div>;
}
