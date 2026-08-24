"use client";

import {
  CalendarDays,
  Camera,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ChevronUp,
  HelpCircle,
  Info,
  LoaderCircle,
  Star,
  X,
} from "lucide-react";
import { Fragment, useEffect, useMemo, useRef, useState } from "react";
import { PatternV2Chart } from "@/components/charts/pattern-v2-chart";
import type { PatternAnalysis, PatternDirection, PatternLookback, PatternMatchedEvent } from "@/engines/pattern";
import { formatPercent } from "@/lib";
import { DataError } from "./data-state";
import { loadPatternAnalysis } from "./pattern-analysis-client";

const lookbacks: Array<{ value: PatternLookback; label: string }> = [
  { value: "1M", label: "1 Month" },
  { value: "3M", label: "3 Months" },
  { value: "6M", label: "6 Months" },
];
const weekDays = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

function dateParts(value: string) {
  const [year, month, day] = value.split("-").map(Number);
  return { year, month, day };
}

function isoDate(year: number, month: number, day: number) {
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

function displayDate(value: string | null) {
  if (!value) return "Dato non disponibile";
  return new Intl.DateTimeFormat("en-GB", { day: "2-digit", month: "short", year: "numeric", timeZone: "UTC" }).format(new Date(`${value}T12:00:00Z`));
}

function signedPercent(value: number | null) {
  return value === null ? "Dato non disponibile" : formatPercent(value * 100, true);
}

export function isPatternCalendarDateDisabled(date: string, analysis: PatternAnalysis) {
  const start = analysis.quality.availableHistory.startDate;
  const latest = analysis.reference.latestAvailableDate;
  if (!start || !latest || date < start || date > latest) return true;
  if (analysis.assetClass === "CRYPTO") return false;
  const day = new Date(`${date}T12:00:00Z`).getUTCDay();
  return day === 0 || day === 6;
}

function HelpPanel({ title, children, label = `Learn about ${title}` }: { title: string; children: React.ReactNode; label?: string }) {
  const [open, setOpen] = useState(false);
  useEffect(() => {
    if (!open) return;
    const close = (event: KeyboardEvent) => { if (event.key === "Escape") setOpen(false); };
    window.addEventListener("keydown", close);
    return () => window.removeEventListener("keydown", close);
  }, [open]);
  return <span className="relative inline-flex align-middle">
    <button type="button" className="icon-button !h-8 !w-8 !border-0 !bg-transparent" aria-label={label} aria-expanded={open} onClick={() => setOpen((value) => !value)}><HelpCircle className="h-4 w-4"/></button>
    {open && <div role="dialog" aria-label={title} className="absolute right-0 top-10 z-40 w-80 max-w-[calc(100vw-2rem)] rounded-2xl border border-slate-200 bg-white p-5 text-left text-sm font-normal shadow-2xl">
      <div className="mb-3 flex items-start justify-between gap-3"><strong>{title}</strong><button type="button" className="icon-button !h-7 !w-7" aria-label="Close help" onClick={() => setOpen(false)}><X className="h-4 w-4"/></button></div>
      <div className="muted grid gap-2 leading-relaxed">{children}</div>
    </div>}
  </span>;
}

function PatternCalendar({ analysis, onSelect, onClose }: { analysis: PatternAnalysis; onSelect: (date: string) => void; onClose: () => void }) {
  const selected = analysis.reference.resolvedDate ?? analysis.reference.latestAvailableDate ?? new Date().toISOString().slice(0, 10);
  const initial = dateParts(selected);
  const [view, setView] = useState({ year: initial.year, month: initial.month });
  useEffect(() => {
    const close = (event: KeyboardEvent) => { if (event.key === "Escape") onClose(); };
    window.addEventListener("keydown", close);
    return () => window.removeEventListener("keydown", close);
  }, [onClose]);
  const first = new Date(Date.UTC(view.year, view.month - 1, 1));
  const days = new Date(Date.UTC(view.year, view.month, 0)).getUTCDate();
  const leading = (first.getUTCDay() + 6) % 7;
  const cells = Array.from({ length: leading + days }, (_, index) => index < leading ? null : index - leading + 1);
  const monthLabel = new Intl.DateTimeFormat("en-GB", { month: "long", year: "numeric", timeZone: "UTC" }).format(first);
  const moveMonth = (delta: number) => {
    const date = new Date(Date.UTC(view.year, view.month - 1 + delta, 1));
    setView({ year: date.getUTCFullYear(), month: date.getUTCMonth() + 1 });
  };
  const startMonth = analysis.quality.availableHistory.startDate?.slice(0, 7);
  const latestMonth = analysis.reference.latestAvailableDate?.slice(0, 7);
  const currentMonth = `${view.year}-${String(view.month).padStart(2, "0")}`;

  return <div role="dialog" aria-modal="true" aria-label="Select pattern reference date" className="absolute left-1/2 top-[calc(100%+0.75rem)] z-50 w-[min(23rem,calc(100vw-2rem))] -translate-x-1/2 rounded-3xl border border-slate-200 bg-white p-5 shadow-2xl" data-testid="pattern-calendar">
    <div className="mb-4 flex items-center justify-between">
      <button className="icon-button" type="button" aria-label="Previous month" disabled={Boolean(startMonth && currentMonth <= startMonth)} onClick={() => moveMonth(-1)}><ChevronLeft/></button>
      <strong className="capitalize">{monthLabel}</strong>
      <button className="icon-button" type="button" aria-label="Next month" disabled={Boolean(latestMonth && currentMonth >= latestMonth)} onClick={() => moveMonth(1)}><ChevronRight/></button>
    </div>
    <div className="grid grid-cols-7 gap-1 text-center text-xs">
      {weekDays.map((day) => <span className="muted py-1 font-semibold" key={day}>{day}</span>)}
      {cells.map((day, index) => day === null ? <span key={`blank-${index}`}/> : (() => {
        const value = isoDate(view.year, view.month, day);
        const disabled = isPatternCalendarDateDisabled(value, analysis);
        const active = value === selected;
        return <button type="button" key={value} disabled={disabled} aria-label={displayDate(value)} aria-current={active ? "date" : undefined} className={`grid aspect-square place-items-center rounded-xl border-0 text-sm font-semibold ${active ? "bg-[var(--navy)] text-white" : disabled ? "bg-transparent text-slate-300" : "bg-slate-50 text-slate-700 hover:bg-emerald-100"}`} onClick={() => { onSelect(value); onClose(); }}>{day}</button>;
      })())}
    </div>
    <div className="mt-4 flex items-center justify-between border-t border-slate-100 pt-4 text-xs"><span className="muted">{analysis.assetClass === "CRYPTO" ? "24/7 calendar" : "Trading sessions"}</span><button type="button" className="button-soft !min-h-9 !px-3" onClick={onClose}>Close</button></div>
  </div>;
}

function PatternControls({ analysis, loading, singleEvents, onSingleEvents, onLookback, onDate }: { analysis: PatternAnalysis; loading: boolean; singleEvents: boolean; onSingleEvents: (value: boolean) => void; onLookback: (value: PatternLookback) => void; onDate: (date: string) => void }) {
  const [calendarOpen, setCalendarOpen] = useState(false);
  const latest = analysis.reference.resolvedDate === analysis.reference.latestAvailableDate;
  return <div className="pattern-controls">
    <div className="flex items-end gap-2">
      <label className="grid gap-1 text-xs font-bold text-slate-600" htmlFor="pattern-lookback">Lookback
        <select id="pattern-lookback" className="h-11 min-w-36 rounded-xl border border-slate-200 bg-white px-4 font-bold text-[var(--navy)]" value={analysis.lookback} disabled={loading} onChange={(event) => onLookback(event.target.value as PatternLookback)}>
          {lookbacks.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}
        </select>
      </label>
      <HelpPanel title="Pattern lookback"><p>The lookback defines the observed price-action window compared with prior history. Changing it recalculates Pattern V2.</p></HelpPanel>
    </div>
    <div className="relative flex items-stretch overflow-visible rounded-2xl bg-[var(--navy)] text-white shadow-sm" data-testid="pattern-date-stepper">
      <button type="button" className="rounded-l-2xl border-0 bg-transparent px-3 text-white disabled:opacity-35" aria-label="Previous valid reference date" disabled={loading || !analysis.reference.previousValidDate} onClick={() => analysis.reference.previousValidDate && onDate(analysis.reference.previousValidDate)}><ChevronLeft/></button>
      <div className="min-w-40 border-x border-white/15 px-4 py-2 text-center"><span className="block text-[10px] font-black uppercase tracking-[.16em] text-emerald-300">{latest ? "Latest" : "Historical"}</span><strong className="block text-sm">{displayDate(analysis.reference.resolvedDate)}</strong></div>
      <button type="button" className="border-0 bg-transparent px-3 text-white disabled:opacity-35" aria-label="Open reference date calendar" aria-expanded={calendarOpen} onClick={() => setCalendarOpen((value) => !value)}><CalendarDays className="h-5 w-5"/></button>
      <button type="button" className="rounded-r-2xl border-0 bg-transparent px-3 text-white disabled:opacity-35" aria-label="Next valid reference date" disabled={loading || !analysis.reference.nextValidDate} onClick={() => analysis.reference.nextValidDate && onDate(analysis.reference.nextValidDate)}><ChevronRight/></button>
      {calendarOpen && <PatternCalendar analysis={analysis} onSelect={onDate} onClose={() => setCalendarOpen(false)}/>}
    </div>
    <div className="flex items-center gap-1">
      <button type="button" role="switch" aria-checked={singleEvents} disabled={loading} className="flex min-h-11 items-center gap-3 rounded-xl border-0 bg-transparent px-2 font-bold" onClick={() => onSingleEvents(!singleEvents)} data-testid="single-events-switch">
        <span className={`relative h-7 w-12 rounded-full transition-colors ${singleEvents ? "bg-emerald-500" : "bg-slate-200"}`}><span className={`absolute top-1 h-5 w-5 rounded-full bg-white shadow transition-all ${singleEvents ? "left-6" : "left-1"}`}/></span>Single Events
      </button>
      <HelpPanel title="Single Events"><p>Enabled shows each individual historical matched event. Disabled focuses on aggregated paths and the most relevant event.</p><p>All paths are historical analogues, not forecasts.</p></HelpPanel>
    </div>
  </div>;
}

function ProbabilityCard({ analysis }: { analysis: PatternAnalysis }) {
  const bullish = analysis.probability.bullish;
  const bearish = analysis.probability.bearish;
  const neutral = analysis.probability.neutral;
  const stars = analysis.robustness.stars;
  return <article className="soft-card p-5" data-testid="pattern-probability-card">
    <div className="flex items-center justify-between"><strong>Probability</strong><HelpPanel title="Historical directional frequency"><p>The percentages are the share of matched historical outcomes that produced each direction under Pattern V2 methodology.</p><p>They describe historical frequency and are not forecast probabilities.</p></HelpPanel></div>
    {bullish === null || bearish === null ? <p className="muted mt-4 text-sm">{analysis.quality.status}</p> : <>
      <div className="mt-4 flex items-baseline justify-between"><span className="positive text-xl font-black">↑ {bullish.toFixed(1)}%</span><span className="negative text-xl font-black">{bearish.toFixed(1)}% ↓</span></div>
      <div className="mt-3 flex h-3 overflow-hidden rounded-full bg-slate-100" aria-label={`Bullish ${bullish}%, bearish ${bearish}%, neutral ${neutral ?? 0}%`}><span className="bg-emerald-500" style={{ width: `${bullish}%` }}/><span className="bg-slate-300" style={{ width: `${neutral ?? 0}%` }}/><span className="bg-rose-500" style={{ width: `${bearish}%` }}/></div>
    </>}
    <div className="mt-6 flex items-center justify-between"><strong>Robustness</strong><HelpPanel title="Pattern robustness"><p>Robustness combines sample adequacy, similarity, outcome consistency, dispersion, temporal diversity and subsample stability.</p></HelpPanel></div>
    <div className="mt-3 flex items-center gap-1 text-indigo-500" aria-label={stars ? `Robustness ${stars} out of 5` : "Robustness unavailable"}>{[1, 2, 3, 4, 5].map((value) => <Star key={value} className="h-5 w-5" fill={stars && value <= stars ? "currentColor" : "none"}/>)}<strong className="ml-2 text-sm text-[var(--navy)]">{stars ? `${stars}/5` : "—"}</strong></div>
    <p className="muted mt-2 text-xs">Composite score {analysis.quality.status === "AVAILABLE" ? `${analysis.robustness.score.toFixed(1)}/100` : "unavailable"}</p>
  </article>;
}

function strengthCopy(analysis: PatternAnalysis) {
  if (analysis.strength.classification === "STRONG") return "High historical directional frequency supported by maximum robustness.";
  if (analysis.strength.classification === "MODERATE") return "Meaningful historical directional consensus, with at least one robustness condition below the strong threshold.";
  if (analysis.strength.classification === "WEAK") return "Low directional consensus or elevated uncertainty across the matched sample.";
  return "The available historical sample is not adequate for a directional classification.";
}

function StrengthCard({ analysis }: { analysis: PatternAnalysis }) {
  const strength = analysis.strength.classification;
  const tone = strength === "STRONG" ? "bg-emerald-100 text-emerald-800" : strength === "MODERATE" ? "bg-amber-100 text-amber-800" : strength === "WEAK" ? "bg-rose-100 text-rose-800" : "bg-slate-100 text-slate-700";
  return <article className="soft-card p-5 text-center" data-testid="pattern-strength-card">
    <div className="flex justify-end"><HelpPanel title="Pattern strength"><p>Pattern strength combines directional frequency and robustness.</p><p><strong>Strong:</strong> dominant probability ≥ 70% and robustness is 5/5.</p><p><strong>Moderate:</strong> dominant probability ≥ 60% but Strong conditions are not met.</p><p><strong>Weak:</strong> dominant probability below 60%.</p><p><strong>Insufficient:</strong> sample requirements are not met.</p></HelpPanel></div>
    <div className={`mx-auto rounded-2xl px-4 py-4 ${tone}`}><span className="text-xs font-bold uppercase tracking-wider">The pattern is</span><div className="mt-1 text-xl font-black">{strength.replaceAll("_", " ")}</div></div>
    <p className="mt-4 text-sm leading-relaxed">{strengthCopy(analysis)}</p>
  </article>;
}

function MostCorrelatedCard({ event }: { event: PatternMatchedEvent | null }) {
  const rows = event ? [
    ["Trade", event.direction], ["Date", displayDate(event.matchEndDate)], ["Performance", signedPercent(event.performance)], ["Max Drop", signedPercent(event.maxDrop)], ["Max Rise", signedPercent(event.maxRise)],
  ] : [];
  return <article className="card p-5" data-testid="most-correlated-card">
    <div className="flex items-center justify-between"><strong>Most Correlated Event</strong><span className="rounded-full bg-indigo-50 px-2 py-1 text-[10px] font-black uppercase text-indigo-700">Best match</span></div>
    {!event ? <p className="muted mt-4 text-sm">Dato non disponibile</p> : <dl className="mt-4 grid gap-3 text-sm">{rows.map(([label, value]) => <div className="flex items-center justify-between gap-4 border-b border-slate-100 pb-2 last:border-0" key={label}><dt className="muted">{label}</dt><dd className={`font-bold ${label === "Trade" ? event.direction === "BULLISH" ? "positive" : event.direction === "BEARISH" ? "negative" : "" : ""}`}>{value}</dd></div>)}</dl>}
  </article>;
}

type SortKey = "similarity" | "date" | "performance";

function CorrelatedEvents({ analysis, selectedId, onSelect }: { analysis: PatternAnalysis; selectedId: string | null; onSelect: (id: string) => void }) {
  const [open, setOpen] = useState<Record<PatternDirection, boolean>>({ BULLISH: true, BEARISH: true, NEUTRAL: true });
  const [sort, setSort] = useState<SortKey>("similarity");
  const groups: PatternDirection[] = ["BULLISH", "BEARISH", "NEUTRAL"];
  const sorted = (direction: PatternDirection) => [...analysis.matchedEvents.filter((event) => event.direction === direction)].sort((left, right) => sort === "date" ? right.matchEndDate.localeCompare(left.matchEndDate) : sort === "performance" ? right.performance - left.performance : left.rank - right.rank);
  return <section className="card overflow-hidden" aria-labelledby="correlated-events-title">
    <div className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-100 p-5 sm:p-6">
      <div className="flex items-center gap-2"><h2 className="text-xl font-black" id="correlated-events-title">Correlated Past Events</h2><HelpPanel title="Correlated Past Events"><p>These are historical periods where price action resembled the selected pattern.</p><p>Each case reports overall performance, maximum drop and maximum rise. Pattern V2 uses these analogues to evaluate historical scenarios; they are not forecasts.</p></HelpPanel></div>
      <label className="text-xs font-bold">Sort <select aria-label="Sort correlated events" className="ml-2 rounded-xl border border-slate-200 bg-white px-3 py-2" value={sort} onChange={(event) => setSort(event.target.value as SortKey)}><option value="similarity">Similarity</option><option value="date">Date</option><option value="performance">Performance</option></select></label>
    </div>
    <div className="overflow-x-auto">
      <table className="data-table min-w-[780px]">
        <thead><tr><th>Start Date</th><th>End Date</th><th>Performance</th><th>Max Drop (%)</th><th>Max Rise (%)</th><th>Similarity</th></tr></thead>
        <tbody>{groups.map((direction) => {
          const events = sorted(direction);
          if (!events.length) return null;
          return <Fragment key={direction}>
            <tr className="bg-slate-50"><td colSpan={6}><button type="button" className="flex w-full items-center gap-2 border-0 bg-transparent py-1 text-left font-black" aria-expanded={open[direction]} onClick={() => setOpen((current) => ({ ...current, [direction]: !current[direction] }))}>{open[direction] ? <ChevronUp className="h-4 w-4"/> : <ChevronDown className="h-4 w-4"/>}{direction[0] + direction.slice(1).toLowerCase()} cases ({events.length})</button></td></tr>
            {open[direction] && events.map((event) => <tr key={event.id} tabIndex={0} aria-selected={selectedId === event.id} className={`${selectedId === event.id ? "selected" : ""} cursor-pointer ${event.rank === 1 ? "font-semibold" : ""}`} onClick={() => onSelect(event.id)} onKeyDown={(keyEvent) => { if (keyEvent.key === "Enter" || keyEvent.key === " ") { keyEvent.preventDefault(); onSelect(event.id); } }}>
              <td>{displayDate(event.startDate)}{event.rank === 1 && <span className="ml-2 rounded-full bg-indigo-100 px-2 py-1 text-[10px] font-black text-indigo-700">BEST</span>}</td><td>{displayDate(event.outcomeEndDate)}</td><td className={event.performance >= 0 ? "positive font-bold" : "negative font-bold"}>{signedPercent(event.performance)}</td><td className="negative font-bold">{signedPercent(event.maxDrop)}</td><td className="positive font-bold">{signedPercent(event.maxRise)}</td><td>{event.similarity.toFixed(1)}%</td>
            </tr>)}
          </Fragment>;
        })}</tbody>
      </table>
    </div>
  </section>;
}

function PatternSkeleton() {
  return <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_280px]" aria-label="Loading Pattern V2 analysis"><div className="soft-card h-[520px] animate-pulse"/><div className="grid gap-4"><div className="soft-card h-52 animate-pulse"/><div className="soft-card h-48 animate-pulse"/><div className="soft-card h-64 animate-pulse"/></div></div>;
}

async function exportResearchPng(node: HTMLElement, symbol: string) {
  const clone = node.cloneNode(true) as HTMLElement;
  const sourceCanvases = [...node.querySelectorAll("canvas")];
  const clonedCanvases = [...clone.querySelectorAll("canvas")];
  clonedCanvases.forEach((clonedCanvas, index) => {
    const sourceCanvas = sourceCanvases[index];
    if (!sourceCanvas) return;
    const snapshot = document.createElement("img");
    snapshot.src = sourceCanvas.toDataURL("image/png");
    snapshot.alt = "Pattern chart snapshot";
    snapshot.width = sourceCanvas.width;
    snapshot.height = sourceCanvas.height;
    snapshot.style.cssText = `display:block;width:${sourceCanvas.clientWidth}px;height:${sourceCanvas.clientHeight}px`;
    clonedCanvas.replaceWith(snapshot);
  });
  clone.querySelectorAll("button, select").forEach((element) => element.remove());
  const width = Math.min(1600, Math.max(960, node.scrollWidth));
  const height = Math.min(2400, Math.max(700, node.scrollHeight));
  const html = new XMLSerializer().serializeToString(clone);
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}"><foreignObject width="100%" height="100%"><div xmlns="http://www.w3.org/1999/xhtml" style="background:#f6f8fb;padding:24px;width:${width - 48}px">${html}</div></foreignObject></svg>`;
  const image = new Image();
  const url = URL.createObjectURL(new Blob([svg], { type: "image/svg+xml;charset=utf-8" }));
  await new Promise<void>((resolve, reject) => { image.onload = () => resolve(); image.onerror = () => reject(new Error("Image export unavailable")); image.src = url; });
  const canvas = document.createElement("canvas");
  canvas.width = width; canvas.height = height;
  canvas.getContext("2d")?.drawImage(image, 0, 0);
  URL.revokeObjectURL(url);
  const anchor = document.createElement("a");
  anchor.download = `${symbol}-pattern-v2.png`;
  anchor.href = canvas.toDataURL("image/png");
  anchor.click();
}

export function PatternExplorer({ symbol, initial }: { symbol: string; initial: PatternAnalysis }) {
  const [analysis, setAnalysis] = useState(initial);
  const [singleEvents, setSingleEvents] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(initial.mostCorrelated?.id ?? null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const researchRef = useRef<HTMLDivElement>(null);
  const selected = useMemo(() => analysis.matchedEvents.find((event) => event.id === selectedId) ?? null, [analysis.matchedEvents, selectedId]);

  async function refresh(lookback: PatternLookback, referenceDate?: string) {
    setLoading(true); setError("");
    try {
      const result = await loadPatternAnalysis(symbol, lookback, referenceDate);
      setAnalysis(result);
      setSelectedId(result.mostCorrelated?.id ?? null);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Pattern analysis temporarily unavailable.");
    } finally { setLoading(false); }
  }

  return <div className="container-shell page-stack" ref={researchRef} data-testid="pattern-research-view">
    <header className="flex flex-wrap items-end justify-between gap-5">
      <div><span className="page-kicker">Historical analogue research / {analysis.modelVersion}</span><h1 className="mt-2 text-3xl font-black tracking-tight">Pattern Intelligence</h1><p className="muted mt-2 max-w-3xl">Compare the selected price path with de-correlated historical analogues, evaluated strictly as of the chosen reference date.</p></div>
      <div className="flex items-center gap-2"><HelpPanel title="Pattern Intelligence"><p>This research view compares the selected observed path with similar historical price-action windows and their subsequent outcomes.</p><p>Every historical backtest is calculated without data after the selected reference date.</p></HelpPanel><button type="button" className="icon-button" aria-label="Export Pattern research view as PNG" onClick={() => researchRef.current && void exportResearchPng(researchRef.current, symbol).catch(() => setError("PNG export is not supported by this browser."))}><Camera/></button></div>
    </header>
    <PatternControls analysis={analysis} loading={loading} singleEvents={singleEvents} onSingleEvents={setSingleEvents} onLookback={(lookback) => void refresh(lookback, analysis.reference.resolvedDate ?? undefined)} onDate={(date) => void refresh(analysis.lookback, date)}/>
    {error && <DataError message={error}/>}
    {loading ? <PatternSkeleton/> : <>
      {analysis.quality.status !== "AVAILABLE" && <div className="rounded-2xl border border-amber-200 bg-amber-50 p-5 text-amber-900" role="status" data-testid="pattern-insufficient-state"><strong>{analysis.quality.status}</strong><p className="mt-1 text-sm">No probability or strength is published until the minimum valid historical sample is available.</p></div>}
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_280px]">
        <section className="card min-w-0 p-4 sm:p-6"><PatternV2Chart analysis={analysis} showSingleEvents={singleEvents} selectedEventId={selectedId}/>{selected && selected.rank !== 1 && <div className="mt-3 rounded-xl bg-amber-50 px-4 py-3 text-sm text-amber-900"><strong>Selected historical event:</strong> #{selected.rank}, {displayDate(selected.matchEndDate)}. The Best match remains rank #1.</div>}</section>
        <aside className="grid content-start gap-4"><ProbabilityCard analysis={analysis}/><StrengthCard analysis={analysis}/><MostCorrelatedCard event={analysis.mostCorrelated}/></aside>
      </div>
      <CorrelatedEvents analysis={analysis} selectedId={selectedId} onSelect={setSelectedId}/>
    </>}
    <footer className="soft-card grid gap-3 p-5 text-xs text-slate-600 sm:grid-cols-2 lg:grid-cols-6" aria-label="Pattern data metadata">
      <span><strong className="block text-[var(--navy)]">Historical data through</strong>{displayDate(analysis.reference.latestAvailableDate)}</span><span><strong className="block text-[var(--navy)]">Reference date</strong>{displayDate(analysis.reference.resolvedDate)}</span><span><strong className="block text-[var(--navy)]">Model</strong>{analysis.modelVersion}</span><span><strong className="block text-[var(--navy)]">Source</strong>{analysis.metadata.provider}</span><span><strong className="block text-[var(--navy)]">Sample</strong>{analysis.probability.sampleSize} matches</span><span><strong className="block text-[var(--navy)]">Quality</strong>{analysis.quality.quality}</span>
      <p className="sm:col-span-2 lg:col-span-6"><Info className="mr-1 inline h-4 w-4"/>Historical analogue analysis does not predict future performance.</p>
    </footer>
    {loading && <div className="fixed bottom-6 right-6 z-50 flex items-center gap-2 rounded-full bg-[var(--navy)] px-4 py-3 text-sm font-bold text-white shadow-xl" role="status"><LoaderCircle className="h-4 w-4 animate-spin"/>Recalculating Pattern V2</div>}
  </div>;
}
