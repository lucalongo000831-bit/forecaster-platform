"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ArrowUpRight, BellRing, Bot, Cpu, Sparkles, Star } from "lucide-react";
import { useState } from "react";
import { formatCompactNumber, formatCurrency, formatDataSource, formatPercent, instrumentPath } from "@/lib";
import type { InstrumentProfile, InstrumentRef } from "@/types";

const tabs = [
  ["overview", "Overview"], ["seasonality", "Seasonality"], ["pattern", "Patterns"],
  ["overbought-oversold", "Momentum"], ["fundamentals/analysis", "Fundamentals"],
  ["political", "Policy"], ["news", "Newsroom"],
] as const;

export function InstrumentShell({ children, instrument }: { children: React.ReactNode; instrument: InstrumentProfile }) {
  const pathname = usePathname();
  const [favorite, setFavorite] = useState(false);
  const compact = !pathname.endsWith("/overview");

  return <>
    <section className={`instrument-head container-shell ${compact ? "instrument-compact" : ""}`}>
      <div className="instrument-hero">
        <div className="instrument-identity">
          <span className="page-kicker">{instrument.category} / {instrument.country} / {instrument.sector}</span>
          <div className="instrument-title">
            <div className="instrument-logo">{instrument.name.slice(0, 1)}</div>
            <div><h1>{instrument.name}</h1><div className="instrument-meta"><strong>{instrument.symbol}</strong><span>{instrument.market}</span><span>{instrument.currency}</span><span className="market-open">{instrument.quote.marketStatus}</span></div></div>
          </div>
          <div className="classification-row">{instrument.classifications.map((item, index) => <span key={item}>{index === 0 && <Cpu size={14}/>} {item}</span>)}</div>
        </div>
        <div className="quote-panel">
          <div className="quote-top"><span>Last price</span><span className="live-indicator"><i/>{formatDataSource(instrument.source, instrument.quote.isDelayed)}</span></div>
          <div className="quote-value">{formatCurrency(instrument.quote.price, instrument.quote.currency)}</div>
          <div className="quote-change"><strong>{instrument.quote.change > 0 ? "+" : ""}{formatCurrency(instrument.quote.change, instrument.quote.currency)}</strong><span>{formatPercent(instrument.quote.changePercent, true)} today</span></div>
          <div className="quote-stats"><span><small>Day range</small><strong>{formatCurrency(instrument.quote.dayLow, instrument.quote.currency)} — {formatCurrency(instrument.quote.dayHigh, instrument.quote.currency)}</strong></span><span><small>Volume</small><strong>{formatCompactNumber(instrument.quote.volume)}</strong></span></div>
        </div>
      </div>
      <div className="instrument-toolbar">
        <nav className="instrument-tabs" aria-label="Instrument sections">
          {tabs.map(([route,label]) => {
            const href = instrumentPath(instrument, route);
            const active = route.startsWith("fundamentals") ? pathname.includes("/fundamentals") : pathname.endsWith(route);
            return <Link key={route} className={active ? "active" : ""} href={href}>{label}</Link>;
          })}
        </nav>
        <button className={`favorite-button ${favorite ? "active" : ""}`} onClick={() => setFavorite(!favorite)} aria-pressed={favorite} aria-label="Toggle favorite"><Star size={18} fill={favorite ? "currentColor" : "none"}/><span>{favorite ? "Watching" : "Watch"}</span></button>
        <button className="agent-cta" onClick={() => alert("Kairo Lens is a demo assistant. Live prices come from the server-side financial provider.")}><Sparkles size={17}/>Ask Lens</button>
      </div>
      <div className="event-strip"><span className="event-icon"><BellRing size={17}/></span><span>{instrument.earnings.daysUntil > 0 ? <><strong>Earnings in {instrument.earnings.daysUntil} days</strong><small>Consensus EPS {formatCurrency(instrument.earnings.consensusEps, instrument.currency)} · {instrument.earnings.dateLabel}</small></> : <><strong>Earnings data unavailable</strong><small>No verified event is currently available from the configured providers.</small></>}</span><button><Bot size={16}/>View event brief <ArrowUpRight size={15}/></button></div>
    </section>
    {children}
  </>;
}

export function FundamentalsTabs({ instrument }: { instrument: InstrumentRef }) {
  const pathname = usePathname();
  const fundamentals = [["analysis","Analysis"],["statements","Statements"],["ratios","Key ratios"],["transcripts","Transcripts"]];
  return <nav className="segmented fundamentals-tabs" aria-label="Fundamentals sections">{fundamentals.map(([route,label])=><Link className={pathname.endsWith(route) ? "active" : ""} href={instrumentPath(instrument, `fundamentals/${route}`)} key={route}>{label}</Link>)}</nav>;
}
