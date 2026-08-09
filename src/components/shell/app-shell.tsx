"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Activity, BarChart3, Bell, BookOpen, CalendarDays, ChevronLeft,
  CircleDollarSign, Command, Gauge, Globe2, Grid3X3, Landmark, LayoutDashboard, Menu,
  FlaskConical, MessageCircle, Newspaper, PieChart, Search, Settings, Sparkles, Star,
  TrendingUp, UserRound,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { instrumentPath } from "@/lib";
import { useMarketSearch } from "@/lib/use-market-search";
import type { SearchInstrument, ShellData } from "@/types";
import { useKairoChat } from "@/components/ai/kairo-chat-provider";
import { GlobalRiskNavIndicator } from "@/components/financial/global-risk-nav-indicator";

const railItems = [
  ["/dashboard", "Control room", LayoutDashboard], ["/search", "Discover", Search],
  ["/global-markets", "Global markets", Globe2],
  ["/calendar", "Calendar", CalendarDays], ["/watchlists", "Watchlists", Star],
  ["/portfolio", "Portfolio", PieChart], ["/alerts", "Alerts", Bell], ["/backtest", "Backtest lab", FlaskConical], ["/settings", "Preferences", Settings],
] as const;

export function AppShell({ children, data }: { children: React.ReactNode; data: ShellData }) {
  const { openKairo } = useKairoChat();
  const pathname = usePathname();
  const [searchOpen, setSearchOpen] = useState(false);
  const [launcherOpen, setLauncherOpen] = useState(false);
  const [railCollapsed, setRailCollapsed] = useState(false);
  const [mobileRail, setMobileRail] = useState(false);
  const [query, setQuery] = useState("");

  useEffect(() => {
    const handleKeys = (event: KeyboardEvent) => {
      if (event.key === "Escape") { setSearchOpen(false); setLauncherOpen(false); }
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault(); setSearchOpen(true); setLauncherOpen(false);
      }
    };
    window.addEventListener("keydown", handleKeys);
    return () => window.removeEventListener("keydown", handleKeys);
  }, []);

  const initialSearch = useMemo<SearchInstrument[]>(() => data.searchResults.map((item) => ({ symbol: item.meta.split(" · ")[0] || item.name, name: item.name, type: "Stock", venue: item.meta, price: 0, href: item.href, source: data.source, currency: "USD" })), [data.searchResults, data.source]);
  const { results: marketMatches, loading: searchLoading, error: searchError } = useMarketSearch(query, initialSearch);
  const matches = marketMatches.map((item) => ({ name: item.name, meta: `${item.symbol} · ${item.venue}`, href: item.href, source: item.source }));
  const launcherItems = [
    ["/watchlists", "Watchlists", Star], ["/calendar", "Calendar", CalendarDays],
    ["/global-markets", "Global markets", Globe2],
    [instrumentPath(data.primaryInstrument, "signal"), "Signals", Sparkles],
    [instrumentPath(data.primaryInstrument, "forecast"), "Forecast", TrendingUp],
    [instrumentPath(data.primaryInstrument, "targets"), "Targets & risk", CircleDollarSign],
    [instrumentPath(data.primaryInstrument, "seasonality"), "Seasonality", TrendingUp],
    [instrumentPath(data.primaryInstrument, "pattern"), "Patterns", BarChart3],
    [instrumentPath(data.primaryInstrument, "overbought-oversold"), "Momentum", Gauge],
    [instrumentPath(data.primaryInstrument, "fundamentals/analysis"), "Fundamentals", Activity],
    [instrumentPath(data.primaryInstrument, "political"), "Policy flow", Landmark],
    [instrumentPath(data.primaryInstrument, "news"), "Briefings", Newspaper],
    [instrumentPath(data.primaryInstrument, "fundamentals/transcripts"), "Transcripts", BookOpen],
    ["/portfolio", "Portfolio", CircleDollarSign], ["/search", "Discover", Search],
    ["/backtest", "Backtest lab", FlaskConical],
    ["/settings", "Profile", UserRound],
  ] as const;
  const currentArea = pathname.startsWith("/instrument") ? "Equity workspace" : railItems.find(([href]) => pathname === href)?.[1] ?? "Market workspace";
  const currentDate = useMemo(() => {
    const parts = new Intl.DateTimeFormat("en-GB", { weekday: "long", day: "2-digit", month: "long", timeZone: "Europe/Rome" }).formatToParts(new Date());
    const value = (type: Intl.DateTimeFormatPartTypes) => parts.find((part) => part.type === type)?.value ?? "";
    return `${value("weekday")} · ${value("day")} ${value("month")}`;
  }, []);

  return (
    <div className={`app-frame ${railCollapsed ? "is-collapsed" : ""}`}>
      {mobileRail && <button className="sidebar-backdrop" aria-label="Close navigation" onClick={() => setMobileRail(false)}/>}
      <aside className={`rail ${mobileRail ? "mobile-open" : ""}`}>
        <div className="rail-brand-row">
          <Link href="/dashboard" className="brand" aria-label={`${data.brand.name} dashboard`}>
            <span className="brand-mark"><span/></span>
            <span className="brand-name"><strong>{data.brand.name}</strong><small>{data.brand.tagline}</small></span>
          </Link>
          <button className="rail-toggle" onClick={() => setRailCollapsed(!railCollapsed)} aria-label="Toggle navigation"><ChevronLeft className={railCollapsed ? "rotate-180" : ""}/></button>
        </div>
        <div className="rail-section-label">Workspace</div>
        <nav className="rail-nav">{railItems.map(([href, label, Icon]) => <Link key={href} href={href} onClick={() => setMobileRail(false)} className={`rail-link ${pathname === href ? "active" : ""}`}><Icon size={20}/><span>{label}</span>{href === "/global-markets" && <GlobalRiskNavIndicator/>}</Link>)}</nav>
        <div className="rail-divider"/>
        <button className="lens-card" onClick={() => openKairo("Genera il Daily Market Narrative di oggi con regime, indici, mover, earnings, macro, news, rischi geopolitici e rilevanza per la watchlist.")}>
          <span className="lens-icon"><Sparkles size={18}/></span>
          <span><strong>Kairo Lens</strong><small>Daily market narrative</small></span>
        </button>
        <div className="market-status"><span className="status-dot"/><span><strong>{data.marketStatus}</strong><small>{data.marketClosesIn}</small></span></div>
      </aside>

      <div className="app-workspace">
        <header className="app-header">
          <button className="mobile-menu-button" aria-label="Open navigation" onClick={() => setMobileRail(true)}><Menu size={21}/></button>
          <div className="workspace-context"><small>{currentDate}</small><strong>{currentArea}</strong></div>
          <button className="search-trigger" onClick={() => { setSearchOpen(true); setLauncherOpen(false); }} aria-expanded={searchOpen}>
            <Search size={19}/><span>Search markets</span><kbd><Command size={12}/>K</kbd>
          </button>
          <div className="header-actions">
            <Link href="/alerts" className="header-icon" aria-label="Notifications"><Bell size={19}/><i/></Link>
            <button className="header-icon" aria-label="Open tools" onClick={() => { setLauncherOpen(!launcherOpen); setSearchOpen(false); }}><Grid3X3 size={19}/></button>
            <button className="avatar" aria-label="Profile">SD</button>
          </div>
        </header>
        <main className="terminal-content">{children}</main>
      </div>

      {searchOpen && <>
        <button className="overlay-backdrop" aria-label="Close search" onClick={() => setSearchOpen(false)}/>
        <div className="search-popover" role="dialog" aria-label="Instrument search">
          <div className="popover-title"><span>Jump to market</span><kbd>ESC</kbd></div>
          <label className="popover-input"><Search size={20}/><input autoFocus value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Symbol, company or asset class"/></label>
          <div className="popover-label">{searchLoading ? "Searching markets…" : "Suggested results"}</div>
          {matches.map(({ name, meta, href }, index) => <Link href={href} onClick={() => setSearchOpen(false)} className="result-row" key={`${name}-${index}`}>
            <span className="result-symbol">{name.slice(0, 2).toUpperCase()}</span>
            <div className="result-meta"><strong>{name}</strong><span>{meta}</span></div>
            <div className="result-tags"><b>SZN</b><b>PTN</b><b>MOM</b></div>
            <span className="result-arrow">↗</span>
          </Link>)}
          {searchError && <div className="p-5 text-center negative">{searchError}</div>}
          {!matches.length && !searchLoading && <div className="p-8 text-center muted">No instruments found.</div>}
        </div>
      </>}

      {launcherOpen && <>
        <button className="overlay-backdrop" aria-label="Close launcher" onClick={() => setLauncherOpen(false)}/>
        <nav className="launcher" aria-label="Tools launcher">
          <div className="launcher-heading">Quick tools</div>
          {launcherItems.map(([href, label, Icon]) => <Link key={href + label} href={href} onClick={() => setLauncherOpen(false)}><Icon size={22}/><span>{label}</span></Link>)}
        </nav>
      </>}
      <button className="chat" aria-label="Open Kairo assistant" onClick={() => openKairo()}><MessageCircle size={22}/><span>Ask Kairo</span></button>
    </div>
  );
}
