"use client";

import { useMemo, useState } from "react";
import { ExternalLink, Newspaper, ShieldCheck } from "lucide-react";
import type { NewsEventType, NewsIntelligenceAnalysis, NewsSentiment } from "@/engines/news";
import { DataUnavailable } from "./data-state";

const categories: Array<NewsEventType | "ALL"> = ["ALL", "EARNINGS", "GUIDANCE", "PRODUCT", "ANALYST", "MACRO", "REGULATORY", "OTHER"];

export function NewsView({ data }: { data: NewsIntelligenceAnalysis | null }) {
  const [category, setCategory] = useState<NewsEventType | "ALL">("ALL");
  const [sentiment, setSentiment] = useState<NewsSentiment | "ALL">("ALL");
  const items = useMemo(() => data?.items.filter((item) => (category === "ALL" || item.eventType === category) && (sentiment === "ALL" || item.sentiment === sentiment)) ?? [], [data, category, sentiment]);
  if (!data) return <div className="container-shell page-stack"><DataUnavailable title="News intelligence unavailable" detail="No sourced metadata was returned by the configured providers."/></div>;
  return <div className="container-shell page-stack">
    <header className="section-row"><div><span className="page-kicker">Newsroom / Sourced intelligence</span><h1 className="page-title">Narrative, with provenance.</h1><p className="muted mt-3">{data.rawCount} source records · {data.deduplicatedCount} unique · {data.sources.length} publisher/provider pairs</p></div><div className="segmented">{(["ALL", "POSITIVE", "NEUTRAL", "NEGATIVE"] as const).map((item) => <button className={sentiment === item ? "active" : ""} onClick={() => setSentiment(item)} key={item}>{item}</button>)}</div></header>
    {data.briefing.length ? <section><div className="insight-hero p-6 text-white md:p-10"><div className="flex items-center justify-between gap-4"><span className="insight-badge">Kairo deterministic brief · {data.modelVersion}</span><ShieldCheck size={20}/></div>{data.briefing.map((line) => <p className="mt-5 max-w-5xl text-xl leading-relaxed" key={line}>{line}</p>)}<p className="mt-6 text-sm text-white/60">{data.aiEnrichment.reason}</p></div></section> : <DataUnavailable title="No briefing available" detail="No unique sourced headlines were returned."/>}
    <section className="grid-3"><div className="soft-card p-6"><span className="small-label">Average sentiment</span><div className={`kpi mt-2 ${data.aggregate.averageSentiment >= .18 ? "positive" : data.aggregate.averageSentiment <= -.18 ? "negative" : "text-black"}`}>{data.aggregate.averageSentiment.toFixed(2)}</div></div><div className="soft-card p-6"><span className="small-label">Positive / negative</span><div className="kpi mt-2 text-black">{data.aggregate.positive} / {data.aggregate.negative}</div></div><div className="soft-card p-6"><span className="small-label">High intensity</span><div className="kpi mt-2 text-black">{data.aggregate.highImpact}</div></div></section>
    <nav className="segmented" aria-label="News categories">{categories.map((item) => <button className={category === item ? "active" : ""} onClick={() => setCategory(item)} key={item}>{item.replaceAll("_", " ")}</button>)}</nav>
    <section className="grid-2">{items.map((item) => <article className="news-card soft-card p-6" key={item.id}><div className="flex items-center justify-between gap-3"><span className="page-kicker">{item.publisher} · {new Date(item.publishedAt).toLocaleDateString("it-IT")}</span><span className={`badge ${item.sentiment === "POSITIVE" ? "badge-buy" : item.sentiment === "NEGATIVE" ? "badge-sell" : "badge-hold"}`}>{item.sentiment}</span></div><h2 className="mt-5 text-2xl font-bold leading-tight">{item.title}</h2><div className="mt-5 flex flex-wrap gap-2"><span className="badge bg-indigo-50 text-indigo-700">{item.eventType.replaceAll("_", " ")}</span><span className="badge bg-slate-100 text-slate-700">{item.exposure}</span><span className="badge bg-slate-100 text-slate-700">Relevance {(item.relevance * 100).toFixed(0)}%</span></div><div className="mt-10 flex items-center justify-between muted"><span>{item.provider} · reliability {(item.sourceReliability * 100).toFixed(0)}%</span><a className="icon-button !h-9 !w-9" href={item.canonicalUrl} target="_blank" rel="noreferrer" aria-label="Open original source"><ExternalLink size={17}/></a></div></article>)}</section>
    {!items.length && <DataUnavailable title="No matching news" detail="No sourced items match the selected filters."/>}
    <p className="muted flex gap-2 text-xs"><Newspaper size={15}/>{data.disclaimer} Persistence: {data.persisted ? "database" : "request cache only"}.</p>
  </div>;
}
