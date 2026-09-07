import Link from "next/link";
import { Suspense } from "react";
import { ArrowRight, CalendarDays, CircleDollarSign, Globe2, Radar, Sparkles, Star, TrendingUp } from "lucide-react";
import { MainPriceChart } from "@/components/charts/lightweight/lightweight-financial-charts";
import { KairoLensButton } from "@/components/ai/kairo-lens-button";
import { financialDataService } from "@/services";
import { formatCurrency, formatPercent, instrumentPath } from "@/lib";
import { DataSourceNotice, DataUnavailable } from "@/components/financial/data-state";
import { getCurrentUser } from "@/lib/server/auth";
import { isDatabaseConfigured } from "@/db";
import { listPortfolios, listWatchlists } from "@/services/account";
import { getMarketCalendar } from "@/services/calendar/calendar-service";
import { DashboardAutoRefresh } from "@/components/financial/dashboard-auto-refresh";
import { getGlobalRiskCurrent } from "@/services/global-risk";

function GlobalRiskFallback() {
  return <div className="gr-dashboard-widget unknown" aria-busy="true"><span className="gr-dashboard-icon"><Globe2/></span><div><span className="page-kicker">Global risk</span><strong>Updating monitor</strong><small>Loading the latest verified risk snapshot…</small></div><ArrowRight/></div>;
}

async function GlobalRiskWidget({ now }: { now: number }) {
  const globalRisk = await getGlobalRiskCurrent().catch(() => null);
  return <Link href="/global-markets" className={`gr-dashboard-widget ${globalRisk?.status.toLowerCase() ?? "unknown"}`}><span className="gr-dashboard-icon"><Globe2/></span><div><span className="page-kicker">Global risk</span><strong>{globalRisk ? `${globalRisk.status} · ${globalRisk.score}/100` : "Unavailable"}</strong><small>{globalRisk ? `${globalRisk.systemicStress === "NONE" ? "No systemic stress" : `Systemic ${globalRisk.systemicStress.toLowerCase()}`} · Updated ${Math.max(0, Math.floor((now - new Date(globalRisk.calculatedAt).getTime()) / 60_000))}m ago` : "Automatic monitor temporarily unavailable"}</small></div><ArrowRight/></Link>;
}

type CurrentUser = Awaited<ReturnType<typeof getCurrentUser>>;

async function GreetingName({ userPromise }: { userPromise: Promise<CurrentUser> }) {
  const user = await userPromise;
  const greeting = user?.name?.trim().split(/\s+/)[0];
  return greeting ? `, ${greeting}` : null;
}

function DashboardContentFallback() {
  return <><section className="market-pulse" aria-busy="true"><div className="pulse-label"><i/><span>Market pulse</span><small>Updating</small></div></section><div className="soft-card h-24 animate-pulse"/><section className="grid-3 metric-grid"><div className="soft-card h-32 animate-pulse"/><div className="soft-card h-32 animate-pulse"/><div className="soft-card h-32 animate-pulse"/></section><div className="soft-card h-80 animate-pulse"/></>;
}

async function DashboardContent({ now, userPromise }: { now: number; userPromise: Promise<CurrentUser> }) {
  const today = new Date(now); const nextWeek = new Date(now + 7 * 86_400_000);
  const privateDataPromise = userPromise.then((user) => user && isDatabaseConfigured()
    ? Promise.all([listPortfolios(user.id), listWatchlists(user.id)]).then(([portfolios, lists]) => ({ portfolios, lists })).catch(() => null)
    : null);
  const [data, user, privateData, calendar] = await Promise.all([
    financialDataService.getDashboardData().catch(() => null),
    userPromise,
    privateDataPromise,
    getMarketCalendar(today.toISOString().slice(0, 10), nextWeek.toISOString().slice(0, 10)).catch(() => null),
  ]);
  if (!data) return <DataUnavailable title="Market overview temporarily unavailable" detail="The workspace remains available while Kairo retries the configured financial providers."/>;
  const portfolio = privateData?.portfolios[0]; const privateItems = privateData?.lists.flatMap((list) => list.items) ?? []; const directional = privateItems.filter((item) => item.signal && item.signal !== "HOLD"); const constructive = directional.filter((item) => item.signal?.includes("BUY")).length; const constructivePercent = directional.length ? constructive / directional.length * 100 : null;
  return <><DataSourceNotice source={data.source}/>
  <section className="market-pulse"><div className="pulse-label"><i/><span>Market pulse</span><small>US session</small></div>{data.pulse.map(({ name, value, change }) => <div className="pulse-item" key={name}><span>{name}</span><strong>{value}</strong><small>{change}</small></div>)}</section>
  <Suspense fallback={<GlobalRiskFallback/>}><GlobalRiskWidget now={now}/></Suspense>
  <section className="grid-3 metric-grid">{[
    ["Portfolio value", portfolio ? formatCurrency(portfolio.totalMarketValue, portfolio.baseCurrency, 0) : "Unavailable", portfolio ? `${formatCurrency(portfolio.unrealizedPnl, portfolio.baseCurrency, 0)} unrealized P/L` : user ? "Create a portfolio to begin" : "Sign in for private holdings", CircleDollarSign, "mint"],
    ["Signal balance", directional.length ? `${constructive}/${directional.length} constructive` : "Unavailable", constructivePercent === null ? "No calculated private-list signals" : `${constructivePercent.toFixed(0)}% constructive`, TrendingUp, "violet"],
    ["Upcoming events", calendar ? `${calendar.events.length} this week` : "Unavailable", calendar ? "Sourced earnings, dividends and macro events" : "No calendar provider available", CalendarDays, "amber"],
  ].map(([label,value,sub,Icon,tone])=><article className={`metric-card ${tone}`} key={String(label)}><div className="metric-icon"><Icon size={20}/></div><div><span className="small-label">{String(label)}</span><div className="kpi mt-3">{String(value)}</div><p className="muted mt-2 text-xs">{String(sub)}</p></div><span className="metric-orbit"/></article>)}</section>
  <section className="dashboard-main grid gap-5 xl:grid-cols-[minmax(0,1.7fr)_390px]"><article className="card chart-card p-5 md:p-7"><div className="section-row"><div><span className="page-kicker">Spotlight / AI infrastructure</span><h2 className="mt-2 text-2xl font-bold tracking-tight">{data.spotlight.name} <span className="muted text-sm font-medium">{data.spotlight.symbol}</span></h2><p className="muted mt-1 text-xs">{formatCurrency(data.spotlight.quote.price, data.spotlight.currency)} · <span className="positive font-bold">{formatPercent(data.spotlight.quote.changePercent, true)} today</span></p></div><Link className="button-outline" href={instrumentPath(data.spotlight, "overview")}>Open workspace <ArrowRight size={16}/></Link></div><MainPriceChart data={data.spotlightSeries} referenceValue={data.spotlight.quote.price} compact/></article><aside className="card watchlist-card overflow-hidden"><div className="watchlist-head"><div><span className="page-kicker">Curated list</span><h2>Daily focus</h2></div><Star size={18}/></div>{data.watchlist.map((row)=><Link href={instrumentPath({ market: row.market || "market", symbol: row.symbol }, "overview")} key={row.symbol} className="watchlist-row"><span className="watchlist-symbol">{row.symbol.replace(/[^A-Z0-9]/g, "").slice(0,2)}</span><div><strong>{row.symbol}</strong><small>{row.name}</small></div><div><strong>{formatCurrency(row.price, row.currency)}</strong><small className={row.changePercent>=0?"positive":"negative"}>{formatPercent(row.changePercent, true)}</small></div></Link>)}<Link href="/watchlists" className="watchlist-more">Open all watchlists <ArrowRight size={15}/></Link></aside></section>
  <section className="lens-brief"><div className="lens-brief-icon"><Sparkles/></div><div><span className="page-kicker">Kairo Lens · Morning brief</span><h2>Build today&apos;s intelligence brief</h2><p>Kairo combines live market context, events, attributed news and your watchlist into a sourced daily narrative.</p></div><KairoLensButton/></section>
</>;
}

export default function DashboardPage(){
  const now = new Date().getTime();
  const userPromise = getCurrentUser().catch(() => null);
  return <div className="container-shell page-stack dashboard-page"><DashboardAutoRefresh refreshVersion={now}/>
    <header className="dashboard-heading"><div><span className="page-kicker">Personal intelligence workspace</span><h1 className="page-title">Good afternoon<Suspense fallback={null}><GreetingName userPromise={userPromise}/></Suspense>.</h1><p className="muted mt-3 text-base">Focus on what moved, what matters and what comes next.</p></div><Link className="button-primary" href="/search"><Radar size={17}/>Explore markets</Link></header>
    <Suspense fallback={<DashboardContentFallback/>}><DashboardContent now={now} userPromise={userPromise}/></Suspense>
  </div>;
}
