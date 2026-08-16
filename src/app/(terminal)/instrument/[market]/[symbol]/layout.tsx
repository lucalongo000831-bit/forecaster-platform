import { Suspense } from "react";
import { InstrumentShell } from "@/components/instrument/instrument-shell";
import { financialDataService } from "@/services";

function InstrumentHeaderFallback() {
  return <section className="instrument-head container-shell" aria-label="Loading instrument header" aria-busy="true"><div className="soft-card h-40 animate-pulse"/></section>;
}

async function InstrumentHeader({ params }: { params: Promise<{ market: string; symbol: string }> }) {
  const ref = await params;
  const instrument = await financialDataService.getInstrument(ref).catch(() => null);
  if (!instrument) return <section className="instrument-head container-shell"><div className="soft-card p-5"><strong>Instrument snapshot temporarily unavailable</strong><p className="muted mt-1 text-sm">Research sections remain accessible while market providers reconnect.</p></div></section>;
  return <InstrumentShell instrument={instrument}>{null}</InstrumentShell>;
}

export default function InstrumentLayout({ children, params }: { children: React.ReactNode; params: Promise<{ market: string; symbol: string }> }) {
  return <><Suspense fallback={<InstrumentHeaderFallback/>}><InstrumentHeader params={params}/></Suspense>{children}</>;
}
