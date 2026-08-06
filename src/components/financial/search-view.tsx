"use client";

import Link from "next/link";
import { ArrowUpRight, Search, SlidersHorizontal } from "lucide-react";
import { useMemo, useState } from "react";
import { formatCurrency } from "@/lib";
import { useMarketSearch } from "@/lib/use-market-search";
import type { SearchInstrument } from "@/types";

export function SearchView({ instruments }: { instruments: SearchInstrument[] }) {
  const [query, setQuery] = useState("");
  const [type, setType] = useState("All");
  const { results, loading, error } = useMarketSearch(query, instruments);
  const filtered = useMemo(() => results.filter((row) => type === "All" || row.type === type), [results, type]);
  return <div className="container-shell page-stack"><header><span className="page-kicker">Discovery</span><h1 className="page-title">Find your next idea.</h1><p className="muted mt-3">Search equities, funds, indices, currencies and digital assets through the server-side provider.</p></header><section className="discover-panel"><label className="discover-input"><Search/><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search company, symbol or theme"/></label><label className="discover-filter"><SlidersHorizontal size={17}/><select value={type} onChange={(event) => setType(event.target.value)}>{["All", "Stock", "ETF", "Index", "Forex", "Crypto"].map((item) => <option key={item}>{item}</option>)}</select></label></section>{loading && <div className="muted">Searching financial providers…</div>}{error && <div className="soft-card p-5 text-red-700">{error}</div>}<section className="table-shell"><table className="data-table"><thead><tr><th>Instrument</th><th>Name</th><th>Type</th><th>Venue</th><th>Last price</th><th/></tr></thead><tbody>{filtered.map((row) => <tr key={`${row.symbol}-${row.venue}`}><td><span className="table-symbol">{row.symbol.replace(/[^A-Z0-9]/g, "").slice(0, 2)}</span><strong>{row.symbol}</strong></td><td>{row.name}{row.source === "mock" && <small className="muted block">DEMO</small>}</td><td><span className="badge bg-indigo-50 text-indigo-700">{row.type}</span></td><td>{row.venue}</td><td className="font-bold">{row.price ? formatCurrency(row.price, row.currency) : "Dato non disponibile"}</td><td><Link className="table-action" href={row.href}>Open <ArrowUpRight size={15}/></Link></td></tr>)}</tbody></table>{!filtered.length && !loading && <div className="p-10 text-center muted">No instruments match these filters.</div>}</section></div>;
}
