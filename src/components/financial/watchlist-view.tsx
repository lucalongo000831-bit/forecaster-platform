"use client";

import { Plus, Trash2, X } from "lucide-react";
import { useState } from "react";
import { formatCurrency, formatPercent } from "@/lib";
import type { WatchlistEntry } from "@/types";

const demoAddition: WatchlistEntry = { symbol: "CRST", name: "Crest Dynamics", price: 76.44, changePercent: 1.14, signal: "BUY" };

export function WatchlistView({ initialRows }: { initialRows: WatchlistEntry[] }) {
  const [rows, setRows] = useState(initialRows);
  const [modal, setModal] = useState(false);
  const add = () => {
    if (!rows.some((row) => row.symbol === demoAddition.symbol)) setRows([...rows, demoAddition]);
    setModal(false);
  };
  return <div className="container-shell page-stack"><header className="section-row"><div><span className="page-kicker">Collections / Daily focus</span><h1 className="page-title">Your watchlists.</h1><p className="muted mt-3">A curated set of mock instruments, signals and price moves.</p></div><button className="button-primary" onClick={() => setModal(true)}><Plus size={17}/>Add instrument</button></header><section className="table-shell"><table className="data-table"><thead><tr><th>Symbol</th><th>Instrument</th><th>Price</th><th>Daily change</th><th>Signal</th><th/></tr></thead><tbody>{rows.map((row) => <tr key={row.symbol}><td><span className="table-symbol">{row.symbol.slice(0, 2)}</span><strong>{row.symbol}</strong></td><td>{row.name}</td><td className="font-bold">{formatCurrency(row.price)}</td><td className={row.changePercent >= 0 ? "positive" : "negative"}>{formatPercent(row.changePercent, true)}</td><td><span className={`badge ${row.signal === "BUY" ? "badge-buy" : row.signal === "SELL" ? "badge-sell" : "badge-hold"}`}>{row.signal}</span></td><td><button className="icon-button !h-9 !w-9" onClick={() => setRows(rows.filter((item) => item.symbol !== row.symbol))} aria-label={`Remove ${row.symbol}`}><Trash2 size={16}/></button></td></tr>)}</tbody></table>{!rows.length && <div className="p-12 text-center muted">Your watchlist is empty.</div>}</section>{modal && <div className="modal-backdrop" onMouseDown={() => setModal(false)}><div className="modal-card card" onMouseDown={(event) => event.stopPropagation()}><div className="flex justify-between"><div><span className="page-kicker">Daily focus</span><h2 className="mt-2 text-2xl font-bold">Add instrument</h2></div><button className="icon-button !h-9 !w-9" onClick={() => setModal(false)}><X size={18}/></button></div><label className="small-label mt-6 block">Symbol</label><input className="modal-input" defaultValue={demoAddition.symbol}/><label className="small-label mt-4 block">Watchlist</label><select className="modal-input"><option>Daily focus</option></select><button className="button-primary mt-6 w-full" onClick={add}>Add to watchlist</button></div></div>}</div>;
}
