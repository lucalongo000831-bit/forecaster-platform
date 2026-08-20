"use client";

import { Check, SlidersHorizontal } from "lucide-react";
import { useEffect, useId, useRef, useState } from "react";
import { createPortal } from "react-dom";

export const SEASONALITY_AVERAGE_SERIES_IDS = [
  "CURRENT",
  "1Y",
  "3Y",
  "5Y",
  "7Y",
  "10Y",
  "15Y",
  "20Y",
  "25Y",
  "MAX",
  "POST_ELECTION",
  "MIDTERM",
  "PRE_ELECTION",
  "ELECTION",
  "BEST_CORRELATED",
] as const;

export type SeasonalityAverageSeriesId = (typeof SEASONALITY_AVERAGE_SERIES_IDS)[number];
export type SeasonalityAverageSeriesGroup = "AVERAGES" | "PRESIDENTIAL" | "BEST_CORRELATED";

export interface SeasonalityAverageSeriesOption {
  id: SeasonalityAverageSeriesId;
  curveId: string | null;
  label: string;
  detail: string;
  group: SeasonalityAverageSeriesGroup;
  available: boolean;
  color: string;
}

interface SeasonalityAverageSeriesSelectorProps {
  options: SeasonalityAverageSeriesOption[];
  selectedSeries: ReadonlySet<SeasonalityAverageSeriesId>;
  onToggle: (id: SeasonalityAverageSeriesId) => boolean;
  onReset: () => void;
  onShowAll: () => void;
}

const GROUPS: Array<{ id: SeasonalityAverageSeriesGroup; label: string }> = [
  { id: "AVERAGES", label: "Averages" },
  { id: "PRESIDENTIAL", label: "US Presidential Cycle" },
  { id: "BEST_CORRELATED", label: "Best Correlated Year" },
];

export function SeasonalityAverageSeriesSelector({
  options,
  selectedSeries,
  onToggle,
  onReset,
  onShowAll,
}: SeasonalityAverageSeriesSelectorProps) {
  const [open, setOpen] = useState(false);
  const [feedback, setFeedback] = useState("");
  const popoverId = useId();
  const rootRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const popoverRef = useRef<HTMLDivElement>(null);
  const activeCount = options.filter((option) => option.available && selectedSeries.has(option.id)).length;

  useEffect(() => {
    if (!open) return;
    const placePopover = () => {
      const button = buttonRef.current;
      const popover = popoverRef.current;
      if (!button || !popover) return;
      if (window.innerWidth < 640) {
        popover.style.inset = "80px 16px auto";
        popover.style.width = "auto";
        popover.style.maxHeight = "calc(100dvh - 96px)";
        return;
      }
      const rect = button.getBoundingClientRect();
      const width = 360;
      const left = Math.min(Math.max(16, rect.right - width), window.innerWidth - width - 16);
      const spaceBelow = window.innerHeight - rect.bottom - 16;
      const preferredHeight = Math.min(640, popover.scrollHeight);
      const openAbove = spaceBelow < Math.min(360, preferredHeight) && rect.top > spaceBelow;
      const maxHeight = openAbove ? Math.max(160, rect.top - 24) : Math.max(160, spaceBelow);
      const top = openAbove ? Math.max(16, rect.top - Math.min(preferredHeight, maxHeight) - 8) : Math.max(16, rect.bottom + 8);
      popover.style.inset = `${top}px auto auto ${left}px`;
      popover.style.width = `${width}px`;
      popover.style.maxHeight = `${maxHeight}px`;
    };
    const handlePointerDown = (event: PointerEvent) => {
      const target = event.target as Node;
      if (!rootRef.current?.contains(target) && !popoverRef.current?.contains(target)) setOpen(false);
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      setOpen(false);
      buttonRef.current?.focus();
    };
    document.addEventListener("pointerdown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);
    window.addEventListener("resize", placePopover);
    window.addEventListener("scroll", placePopover, true);
    placePopover();
    queueMicrotask(() => popoverRef.current?.querySelector<HTMLElement>("[role='switch']:not(:disabled)")?.focus());
    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("resize", placePopover);
      window.removeEventListener("scroll", placePopover, true);
    };
  }, [open]);

  function toggle(option: SeasonalityAverageSeriesOption) {
    if (!option.available) return;
    const accepted = onToggle(option.id);
    setFeedback(accepted ? "" : "At least one series must remain active.");
  }

  return <div ref={rootRef} className="relative">
    <button
      ref={buttonRef}
      type="button"
      className={`relative grid size-9 place-items-center rounded-xl border transition ${open ? "border-[var(--navy)] bg-[var(--navy)] text-white shadow-lg" : "border-[var(--border)] bg-white text-[var(--ink-2)] hover:border-[#9ca8d8] hover:bg-[#f4f6ff] hover:text-[var(--violet)]"}`}
      aria-label="Configure average series"
      aria-haspopup="dialog"
      aria-expanded={open}
      aria-controls={popoverId}
      title="Configure Average series"
      onClick={() => { setOpen((current) => !current); setFeedback(""); }}
    >
      <SlidersHorizontal size={16}/>
      <span className="absolute -right-1.5 -top-1.5 grid min-w-4.5 place-items-center rounded-full bg-[var(--accent)] px-1 text-[9px] font-extrabold leading-[18px] text-[var(--navy)]" aria-hidden="true">{activeCount}</span>
    </button>

    {open && typeof document !== "undefined" ? createPortal(<div
      ref={popoverRef}
      id={popoverId}
      role="dialog"
      aria-label="Configure average series"
      className="fixed inset-x-4 top-20 z-[100] max-h-[calc(100dvh-6rem)] overflow-y-auto rounded-2xl border border-[#cad3e1] bg-white p-4 shadow-[0_24px_70px_rgba(11,25,49,0.24)]"
    >
      <div className="mb-4 flex items-start justify-between gap-4 border-b border-slate-100 pb-3">
        <div><strong className="block text-sm">Average series</strong><p className="muted mt-1 text-xs">Shared across daily, weekly and monthly views.</p></div>
        <span className="badge bg-[#e8fbf4] text-[var(--accent-dark)]">{activeCount} active</span>
      </div>

      <div className="space-y-5">
        {GROUPS.map((group) => <section key={group.id} aria-labelledby={`${popoverId}-${group.id}`}>
          <h3 id={`${popoverId}-${group.id}`} className="small-label mb-2">{group.label}</h3>
          <div className="space-y-1">
            {options.filter((option) => option.group === group.id).map((option) => {
              const checked = option.available && selectedSeries.has(option.id);
              return <button
                key={option.id}
                type="button"
                role="switch"
                aria-checked={checked}
                aria-label={option.label}
                disabled={!option.available}
                title={option.available ? option.detail : `Insufficient history — ${option.detail}`}
                onClick={() => toggle(option)}
                className="flex w-full items-center gap-3 rounded-xl px-2.5 py-2 text-left transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
              >
                <span className="size-2.5 shrink-0 rounded-full" style={{ backgroundColor: option.color }}/>
                <span className="min-w-0 flex-1"><strong className="block text-xs">{option.label}</strong><span className="muted mt-0.5 block truncate text-[10px]">{option.detail}</span></span>
                <span className={`relative h-5 w-9 shrink-0 rounded-full transition ${checked ? "bg-[var(--accent)]" : "bg-slate-200"}`} aria-hidden="true">
                  <span className={`absolute top-0.5 grid size-4 place-items-center rounded-full bg-white shadow-sm transition ${checked ? "left-[18px]" : "left-0.5"}`}>{checked ? <Check size={10} className="text-[var(--accent-dark)]"/> : null}</span>
                </span>
              </button>;
            })}
          </div>
        </section>)}
      </div>

      <p className={`mt-3 min-h-4 text-xs font-semibold ${feedback ? "text-[#b82f47]" : "text-transparent"}`} role="status" aria-live="polite">{feedback || "Selection updated"}</p>
      <div className="mt-1 flex items-center justify-between gap-3 border-t border-slate-100 pt-3">
        <button type="button" className="text-xs font-bold text-[var(--muted)] hover:text-[var(--ink)]" onClick={() => { onReset(); setFeedback(""); }}>Reset</button>
        <button type="button" className="rounded-lg bg-[var(--navy)] px-3 py-2 text-xs font-bold text-white hover:bg-[var(--ink-2)]" onClick={() => { onShowAll(); setFeedback(""); }}>Show all available</button>
      </div>
    </div>, document.body) : null}
  </div>;
}
