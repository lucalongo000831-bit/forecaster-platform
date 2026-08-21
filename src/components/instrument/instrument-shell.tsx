"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ArrowUpRight, BellRing, Bot, Cpu, Sparkles, Star } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { formatCompactNumber, formatCurrency, formatDataSource, formatPercent, instrumentPath } from "@/lib";
import type { InstrumentProfile, InstrumentRef, QuoteResponse } from "@/types";
import { useKairoChat } from "@/components/ai/kairo-chat-provider";

const tabs = [
  ["overview", "Overview"], ["analysis", "Analisi completa"], ["signal", "Signals"], ["forecast", "Forecast"], ["targets", "Targets"], ["seasonality", "Seasonality"], ["pattern", "Patterns"],
  ["overbought-oversold", "Momentum"], ["fundamentals/analysis", "Fundamentals"],
  ["political", "Political"], ["news", "Newsroom"],
] as const;

export function InstrumentShell({ children, instrument }: { children: React.ReactNode; instrument: InstrumentProfile }) {
  const { openKairo } = useKairoChat();
  const pathname = usePathname();
  const [favorite, setFavorite] = useState(false);
  const [quote, setQuote] = useState(instrument.quote);
  const compact = !pathname.endsWith("/overview");

  const refreshQuote = useCallback(async () => {
    if (document.hidden) return;
    try {
      const response = await fetch(`/api/market/quote?symbol=${encodeURIComponent(instrument.symbol)}`, { cache: "no-store" });
      const body = await response.json() as QuoteResponse | { error?: { message?: string } };
      if (!response.ok || !("data" in body)) return;
      setQuote({
        price: body.data.price, change: body.data.change, changePercent: body.data.changePercent,
        dayLow: body.data.dayLow ?? body.data.price, dayHigh: body.data.dayHigh ?? body.data.price,
        volume: body.data.volume ?? 0, currency: body.data.currency,
        marketStatus: body.data.marketState === "REGULAR" ? "Market open" : body.data.marketState === "EXTENDED" ? "Extended hours" : "Market closed",
        open: body.data.open ?? undefined, previousClose: body.data.previousClose ?? undefined, marketCap: body.data.marketCap ?? undefined,
        asOf: body.data.asOf ?? undefined, isDelayed: body.data.isDelayed, source: body.data.source,
        provider: body.meta.provider ?? body.meta.source, sourceTimestamp: body.meta.sourceTimestamp, fetchedAt: body.meta.fetchedAt,
        freshnessType: body.meta.freshnessType, delaySeconds: body.meta.delaySeconds, bid: body.data.bid, ask: body.data.ask,
      });
    } catch { /* The last verified snapshot remains visible with its timestamp. */ }
  }, [instrument.symbol]);

  const prefetchSeasonality = useCallback(() => {
    void import("@/components/financial/seasonality-explorer-loader").then(({ prefetchSeasonalityAnalysis }) => {
      prefetchSeasonalityAnalysis(instrument.symbol);
    });
  }, [instrument.symbol]);

  const prefetchPattern = useCallback(() => {
    void import("@/components/financial/pattern-analysis-client").then(({ prefetchPatternAnalysis }) => {
      prefetchPatternAnalysis(instrument.symbol);
    });
  }, [instrument.symbol]);

  useEffect(() => {
    let timer: number | undefined;
    const schedule = () => {
      window.clearTimeout(timer);
      if (document.hidden) return;
      const interval = quote.marketStatus === "Market open" || quote.marketStatus === "Extended hours" ? 5_000 : 60_000;
      timer = window.setTimeout(async () => { await refreshQuote(); schedule(); }, interval);
    };
    const visibility = () => { if (!document.hidden) void refreshQuote(); schedule(); };
    document.addEventListener("visibilitychange", visibility);
    schedule();
    return () => { window.clearTimeout(timer); document.removeEventListener("visibilitychange", visibility); };
  }, [quote.marketStatus, refreshQuote]);

  const freshnessLabel = quote.freshnessType === "REALTIME" ? "LIVE" : quote.freshnessType === "NEAR_REALTIME" ? "LIVE · REST" : quote.freshnessType === "DELAYED" ? `DELAYED${quote.delaySeconds ? ` · ${Math.ceil(quote.delaySeconds / 60)} MIN` : ""}` : quote.freshnessType === "STALE" ? "STALE" : quote.freshnessType === "CACHED" ? "CACHED" : formatDataSource(quote.source, quote.isDelayed);
  const freshnessTitle = `Provider: ${quote.provider ?? quote.source ?? "unavailable"}\nUpdated: ${quote.sourceTimestamp ? new Date(quote.sourceTimestamp).toLocaleTimeString("en-GB") : "unavailable"}\nMarket: ${instrument.exchange ?? instrument.market}`;

  return <>
    <section className={`instrument-head container-shell ${compact ? "instrument-compact" : ""}`}>
      <div className="instrument-hero">
        <div className="instrument-identity">
          <span className="page-kicker">{instrument.category} / {instrument.country} / {instrument.sector}</span>
          <div className="instrument-title">
            <div className="instrument-logo">{instrument.name.slice(0, 1)}</div>
            <div><h1>{instrument.name}</h1><div className="instrument-meta"><strong>{instrument.symbol}</strong><span>{instrument.market}</span><span>{instrument.currency}</span><span className="market-open">{quote.marketStatus}</span></div></div>
          </div>
          <div className="classification-row">{instrument.classifications.map((item, index) => <span key={item}>{index === 0 && <Cpu size={14}/>} {item}</span>)}</div>
        </div>
        <div className="quote-panel">
          <div className="quote-top"><span>Last price</span><span className="live-indicator" title={freshnessTitle}><i/>{freshnessLabel}</span></div>
          <div className="quote-value">{formatCurrency(quote.price, quote.currency)}</div>
          <div className="quote-change"><strong>{quote.change > 0 ? "+" : ""}{formatCurrency(quote.change, quote.currency)}</strong><span>{formatPercent(quote.changePercent, true)} today</span></div>
          <div className="quote-stats"><span><small>Day range</small><strong>{formatCurrency(quote.dayLow, quote.currency)} — {formatCurrency(quote.dayHigh, quote.currency)}</strong></span><span><small>Volume</small><strong>{formatCompactNumber(quote.volume)}</strong></span></div>
        </div>
      </div>
      <div className="instrument-toolbar">
        <nav className="instrument-tabs" aria-label="Instrument sections">
          {tabs.map(([route,label]) => {
            const href = instrumentPath(instrument, route);
            const active = route.startsWith("fundamentals") ? pathname.includes("/fundamentals") : pathname.endsWith(route);
            const prefetch = route === "seasonality" ? prefetchSeasonality : route === "pattern" ? prefetchPattern : undefined;
            return <Link key={route} className={active ? "active" : ""} href={href} onPointerEnter={prefetch} onFocus={prefetch}>{label}</Link>;
          })}
        </nav>
        <button className={`favorite-button ${favorite ? "active" : ""}`} onClick={() => setFavorite(!favorite)} aria-pressed={favorite} aria-label="Toggle favorite"><Star size={18} fill={favorite ? "currentColor" : "none"}/><span>{favorite ? "Watching" : "Watch"}</span></button>
        <button className="agent-cta" onClick={() => openKairo()}><Sparkles size={17}/>Ask Lens</button>
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
