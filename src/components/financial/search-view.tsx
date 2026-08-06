"use client";

import Link from "next/link";
import { ArrowUpRight, Search, SlidersHorizontal } from "lucide-react";
import { useMemo, useState } from "react";
import { formatCurrency } from "@/lib";
import type { SearchInstrument } from "@/types";

export function SearchView({ instruments }: { instruments: SearchInstrument[] }) {
  const [query, setQuery] = useState("");
  const [type, setType] = useState("All");
  const filtered = useMemo(() => instruments.filter((row) => (type === "All" || row.type === type) && `${row.symbol} ${row.name}`.toLowerCase().includes(query.toLowerCase())), [instruments, query, type]);
  return <div className="container-shell page-stack"><header><span className="page-kicker">Discovery</span><h1 className="page-title">Find your next idea.</h1><p className="muted mt-3">Explore a realistic static universe across equities, funds, indices and digital assets.</p></header><section className="discover-panel"><label className="discover-input"><Search/><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search company, symbol or theme"/></label><label className="discover-filter"><SlidersHorizontal size={17}/><select value={type} onChange={(event) => setType(event.target.value)}>{["All", "Stock", "ETF", "Index", "Forex", "Crypto"].map((item) => <option key={item}>{item}</option>)}</select></label></section><section className="table-shell"><table className="data-table"><thead><tr><th>Instrument</th><th>Name</th><th>Type</th><th>Venue</th><th>Mock price</th><th/></tr></thead><tbody>{filtered.map((row) => <tr key={row.symbol}><td><span className="table-symbol">{row.symbol.slice(0, 2)}</span><strong>{row.symbol}</strong></td><td>{row.name}</td><td><span className="badge bg-indigo-50 text-indigo-700">{row.type}</span></td><td>{row.venue}</td><td className="font-bold">{formatCurrency(row.price)}</td><td><Link className="table-action" href={row.href}>Open <ArrowUpRight size={15}/></Link></td></tr>)}</tbody></table>{!filtered.length && <div className="p-10 text-center muted">No instruments match these filters.</div>}</section></div>;
}
