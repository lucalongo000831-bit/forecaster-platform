"use client";

import { useState } from "react";
import { formatNumber } from "@/lib";
import type { InsiderTransaction, PatternCase, PoliticalTrade } from "@/types";

export function InsiderTable({ transactions }: { transactions: InsiderTransaction[] }) {
  const [selected, setSelected] = useState(13);
  return <div className="table-shell"><table className="data-table"><thead><tr><th>#</th><th>Date</th><th>Insider</th><th>Shares Type</th><th>Transaction</th><th>Value</th><th>Shares</th></tr></thead><tbody>
    {transactions.map((row) => <tr onClick={() => setSelected(row.id)} className={selected === row.id ? "selected" : ""} key={row.id}><td>{row.id}</td><td>{row.date}</td><td><strong>{row.insider}</strong><small className="block muted">{row.role}</small></td><td>{row.security}</td><td>{row.transaction}</td><td>{row.value.toFixed(3)}</td><td>{formatNumber(row.shares)}</td></tr>)}
  </tbody></table></div>;
}

export function PatternCasesTable({ cases }: { cases: PatternCase[] }) {
  const [bullish, setBullish] = useState(true);
  const [bearish, setBearish] = useState(true);
  const [neutral, setNeutral] = useState(true);
  const [selected, setSelected] = useState<number | string | null>(null);
  const bullishCases = cases.filter((row) => row.direction === "bullish");
  const bearishCases = cases.filter((row) => row.direction === "bearish");
  const neutralCases = cases.filter((row) => row.direction === "neutral");
  const signed = (value: number) => `${value > 0 ? "+" : ""}${value.toFixed(2)}%`;
  const renderRow = (row: PatternCase) => <tr className={selected === row.id ? "selected" : ""} onClick={() => setSelected(row.id)} key={row.id}><td>{row.start}</td><td>{row.end}</td><td className={row.performance > 0 ? "positive font-bold" : row.performance < 0 ? "negative font-bold" : "font-bold"}>{signed(row.performance)}</td><td className="negative font-bold">{signed(row.drop)}</td><td className="positive font-bold">{signed(row.rise)}</td><td>{row.similarity === undefined ? "—" : `${row.similarity.toFixed(1)}%`}</td></tr>;
  return <div className="table-shell"><table className="data-table"><thead><tr><th>Start Date</th><th>End Date</th><th>Performance</th><th>Max Drop</th><th>Max Rise</th><th>Similarity</th></tr></thead><tbody>
    <tr><td colSpan={6}><button className="border-0 bg-transparent font-bold" onClick={() => setBullish(!bullish)}>⌄ Bullish cases ({bullishCases.length})</button></td></tr>
    {bullish && bullishCases.map(renderRow)}
    <tr><td colSpan={6}><button className="border-0 bg-transparent font-bold" onClick={() => setBearish(!bearish)}>⌄ Bearish cases ({bearishCases.length})</button></td></tr>
    {bearish && bearishCases.map(renderRow)}
    <tr><td colSpan={6}><button className="border-0 bg-transparent font-bold" onClick={() => setNeutral(!neutral)}>⌄ Neutral cases ({neutralCases.length})</button></td></tr>
    {neutral && neutralCases.map(renderRow)}
  </tbody></table></div>;
}

export function PoliticalTable({ trades }: { trades: PoliticalTrade[] }) {
  return <><div className="table-shell"><table className="data-table"><thead><tr><th>Politician</th><th>Type</th><th>Disclosure</th><th>Transaction</th><th>Delay</th><th>Asset / amount</th></tr></thead><tbody>
    {trades.map((row) => <tr key={row.id}><td><div className="flex items-center gap-3"><span className="grid h-12 w-12 place-items-center rounded-full bg-blue-100 font-bold">{row.name.split(" ").map((part) => part[0]).slice(0, 2).join("")}</span><div><strong>{row.name}</strong><small className="block muted">{row.role} · {row.region}</small>{row.party && <small>{row.party}</small>}</div></div></td><td><span className={`badge ${row.type === "BUY" ? "badge-buy" : row.type === "SELL" ? "badge-sell" : ""}`}>{row.type}</span></td><td>{row.published}</td><td>{row.traded}</td><td>{row.disclosureDelayDays === null || row.disclosureDelayDays === undefined ? "—" : `${row.disclosureDelayDays}d`}</td><td><strong>{row.asset ?? "Asset not specified"}</strong><small className="muted block">{row.amount}{row.ownership ? ` · ${row.ownership}` : ""}</small></td></tr>)}
  </tbody></table></div><div className="political-pagination"><span>{trades.length} recorded trades</span><strong>Page 1 of 1</strong><button className="button-outline" disabled>Previous</button><button className="button-outline" disabled>Next</button></div></>;
}
