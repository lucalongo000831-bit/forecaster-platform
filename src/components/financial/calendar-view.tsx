"use client";

import { useState } from "react";
import { CalendarClock } from "lucide-react";
import type { CalendarData, Signal } from "@/types";

export function CalendarView({ data }: { data: CalendarData }) {
  const [filter, setFilter] = useState<Signal | "ALL">("ALL");
  const [selected, setSelected] = useState(6);
  return <div className="container-shell page-stack"><header className="section-row"><div><span className="page-kicker">Workspace / Events</span><h1 className="page-title">Market calendar.</h1><p className="muted mt-3">{data.monthLabel} · signals, releases and portfolio events</p></div><div className="segmented">{(["ALL", "BUY", "HOLD", "SELL"] as const).map((item) => <button className={filter === item ? "active" : ""} onClick={() => setFilter(item)} key={item}>{item}</button>)}</div></header><section className="calendar-grid grid grid-cols-7 overflow-hidden">{["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((day) => <div className="calendar-day-label p-3 text-center font-bold" key={day}>{day}</div>)}{data.days.map((item) => <button onClick={() => setSelected(item.day)} key={item.day} className={`calendar-cell min-h-28 p-3 text-left ${selected === item.day ? "selected" : ""} ${filter !== "ALL" && filter !== item.signal ? "opacity-25" : ""}`}><strong>{item.day}</strong><span className={`badge mt-5 block ${item.signal === "BUY" ? "badge-buy" : item.signal === "SELL" ? "badge-sell" : "badge-hold"}`}>{item.signal}</span>{item.events ? <small className="muted mt-2 block">{item.events} events</small> : null}</button>)}</section><section className="event-detail soft-card p-6"><div className="event-icon"><CalendarClock size={18}/></div><div><span className="small-label">Selected day · August {selected}</span><h2 className="mt-2 text-2xl font-bold">{data.selectedEventTitle}</h2><p className="muted mt-2">{data.selectedEventDescription}</p></div></section></div>;
}
