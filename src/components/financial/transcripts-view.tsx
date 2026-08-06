"use client";

import { useState } from "react";
import type { Transcript } from "@/types";
import { DataUnavailable } from "./data-state";

export function TranscriptsView({ transcripts }: { transcripts: Transcript[] }) {
  const [activePeriod, setActivePeriod] = useState(transcripts[0]?.period ?? "");
  const active = transcripts.find((item) => item.period === activePeriod) ?? transcripts[0];
  if (!active) return <DataUnavailable title="Transcripts unavailable" detail="Yahoo Finance does not provide complete earnings-call transcripts. No demo transcript is shown as real data."/>;
  return <section className="grid gap-6 lg:grid-cols-[250px_1fr]"><aside className="card overflow-hidden"><div className="bg-[var(--navy)] p-5 text-white font-bold">Earnings calls</div>{transcripts.map((transcript) => <button key={transcript.period} onClick={() => setActivePeriod(transcript.period)} className={`block w-full border-0 border-b border-slate-200 p-4 text-left ${active.period === transcript.period ? "bg-indigo-50 font-bold" : "bg-white"}`}>{transcript.period}<small className="muted block">Demo transcript</small></button>)}</aside><article className="soft-card p-7"><span className="page-kicker">{active.period} · {active.date}</span><h2 className="mt-3 text-3xl font-bold">{active.title}</h2>{active.paragraphs.map((paragraph) => <p className="mt-5 leading-7" key={paragraph.speaker}><strong>{paragraph.speaker}:</strong> {paragraph.text}</p>)}</article></section>;
}
