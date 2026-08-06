"use client";

import Link from "next/link";
import { Plus, Trash2, X } from "lucide-react";
import { useState } from "react";
import { formatCurrency, formatPercent } from "@/lib";
import { useMarketSearch } from "@/lib/use-market-search";
import type { QuoteResponse, SearchInstrument, WatchlistEntry } from "@/types";

const emptySearch: SearchInstrument[] = [];

export function WatchlistView({ initialRows }: { initialRows: WatchlistEntry[] }) {
  const [rows, setRows] = useState(initialRows);
  const [modal, setModal] = useState(false);
  const [query, setQuery] = useState("");
  const [adding, setAdding] = useState(false);
  const { results, loading, error } = useMarketSearch(query, emptySearch);
  const selected = results[0];

  async function add() {
    if (!selected || adding) return;
    setAdding(true);
    try {
      const response = await fetch(`/api/market/quote?symbol=${encodeURIComponent(selected.symbol)}`);
      const body = await response.json() as QuoteResponse;
      if (response.ok && "data" in body && !rows.some((row) => row.symbol === selected.symbol)) {
        const quote = body.data;
        setRows([...rows, {
          symbol: quote.symbol,
          name: quote.name,
          price: quote.price,
          changePercent: quote.changePercent,
          signal: quote.changePercent >= .75 ? "BUY" : quote.changePercent <= -.75 ? "SELL" : "HOLD",
          currency: quote.currency,
          market: selected.href.split("/")[2],
          source: body.meta.source,
        }]);
        setModal(false); setQuery("");
      }
    } finally { setAdding(false); }
  }

  return <div className="container-shell page-stack"><header className="section-row"><div><span className="page-kicker">Collections / Daily focus</span><h1 className="page-title">Your watchlists.</h1><p className="muted mt-3">Server-side quotations with a simple daily-momentum signal.</p></div><button className="button-primary" onClick={() => setModal(true)}><Plus size={17}/>Add instrument</button></header><section className="table-shell"><table className="data-table"><thead><tr><th>Symbol</th><th>Instrument</th><th>Price</th><th>Daily change</th><th>Signal</th><th/></tr></thead><tbody>{rows.map((row) => <tr key={row.symbol}><td><span className="table-symbol">{row.symbol.replace(/[^A-Z0-9]/g, "").slice(0, 2)}</span><strong>{row.symbol}</strong></td><td><Link href={`/instrument/${encodeURIComponent(row.market || "market")}/${encodeURIComponent(row.symbol.toLowerCase())}/overview`}>{row.name}</Link>{row.source === "mock" && <small className="muted block">DEMO</small>}</td><td className="font-bold">{formatCurrency(row.price, row.currency)}</td><td className={row.changePercent >= 0 ? "positive" : "negative"}>{formatPercent(row.changePercent, true)}</td><td><span className={`badge ${row.signal === "BUY" ? "badge-buy" : row.signal === "SELL" ? "badge-sell" : "badge-hold"}`}>{row.signal}</span></td><td><button className="icon-button !h-9 !w-9" onClick={() => setRows(rows.filter((item) => item.symbol !== row.symbol))} aria-label={`Remove ${row.symbol}`}><Trash2 size={16}/></button></td></tr>)}</tbody></table>{!rows.length && <div className="p-12 text-center muted">Your watchlist is empty.</div>}</section>{modal && <div className="modal-backdrop" onMouseDown={() => setModal(false)}><div className="modal-card card" onMouseDown={(event) => event.stopPropagation()}><div className="flex justify-between"><div><span className="page-kicker">Daily focus</span><h2 className="mt-2 text-2xl font-bold">Add instrument</h2></div><button className="icon-button !h-9 !w-9" onClick={() => setModal(false)}><X size={18}/></button></div><label className="small-label mt-6 block">Symbol or company</label><input className="modal-input" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="AAPL, ENI.MI, Bitcoin…"/>{loading && <p className="muted mt-3">Searching…</p>}{error && <p className="negative mt-3">{error}</p>}{selected && <div className="soft-card mt-3 p-4"><strong>{selected.symbol} · {selected.name}</strong><small className="muted block">{selected.venue} · {selected.type}</small></div>}<label className="small-label mt-4 block">Watchlist</label><select className="modal-input"><option>Daily focus</option></select><button disabled={!selected || adding} className="button-primary mt-6 w-full" onClick={add}>{adding ? "Adding…" : "Add to watchlist"}</button></div></div>}</div>;
}
