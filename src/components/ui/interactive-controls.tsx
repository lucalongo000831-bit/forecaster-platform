"use client";

import { ChevronLeft, ChevronRight, RotateCcw } from "lucide-react";
import { useState } from "react";

export function RangeControls({ ranges = ["1D","5D","1M","6M","YTD","1Y","5Y","MAX"], initial = "5Y", value, onChange, disabled = false }: { ranges?: string[]; initial?: string; value?: string; onChange?: (range: string) => void; disabled?: boolean }) {
  const [localActive, setLocalActive] = useState(initial);
  const active = value ?? localActive;
  const select = (range: string) => { if (value === undefined) setLocalActive(range); onChange?.(range); };
  return <div className="flex flex-wrap items-center gap-2">{ranges.map((range)=><button disabled={disabled} key={range} onClick={()=>select(range)} className={`icon-button !w-auto !rounded-full px-4 ${active===range ? "!bg-[var(--navy)] !text-white" : ""}`}>{range}</button>)}<button disabled={disabled} className="icon-button" onClick={()=>select(initial)} aria-label="Reset range"><RotateCcw/></button></div>;
}

export function PeriodToggle() {
  const [active,setActive]=useState("Annual");
  return <div className="segmented">{["Annual","Quarterly"].map((label)=><button className={active===label?"active":""} key={label} onClick={()=>setActive(label)}>{label}</button>)}</div>;
}

export function DateStepper() {
  const [step,setStep]=useState(0);
  const date = new Date(Date.UTC(2026,7,5-step));
  const formatted = `${String(date.getUTCDate()).padStart(2,"0")}/${String(date.getUTCMonth()+1).padStart(2,"0")}/${date.getUTCFullYear()}`;
  return <div className="flex items-stretch overflow-hidden rounded-xl bg-[var(--navy)] text-white"><button className="px-4 border-0 bg-transparent text-white" onClick={()=>setStep(step+1)} aria-label="Previous date"><ChevronLeft/></button><div className="border-x border-white/20 px-8 py-2 text-center"><span className="small-label !text-blue-200">Latest</span><strong className="block">{formatted}</strong></div><button className="px-4 border-0 bg-transparent text-white" onClick={()=>setStep(Math.max(0,step-1))} aria-label="Next date"><ChevronRight/></button></div>;
}

export function Switch({ label }: { label: string }) {
  const [on,setOn]=useState(false);
  return <button onClick={()=>setOn(!on)} className="flex items-center gap-3 border-0 bg-transparent font-bold" aria-pressed={on}><span className={`relative h-7 w-12 rounded-full ${on?"bg-green-500":"bg-slate-200"}`}><span className={`absolute top-1 h-5 w-5 rounded-full bg-white transition-all ${on?"left-6":"left-1"}`}/></span>{label}</button>;
}
