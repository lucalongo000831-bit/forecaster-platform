"use client";

import { AlertTriangle, CheckCircle2, Database, SearchX } from "lucide-react";
import type { PoliticalIntelligenceReport, PoliticalPeriod } from "@/types";

const copy: Record<PoliticalIntelligenceReport["dataStatus"], { title: string; description: string }> = {
  HAS_ACTIVITY: { title: "Political activity available", description: "Public disclosures matched this asset." },
  VERIFIED_ZERO: { title: "No disclosed political activity", description: "Kairo found no matching public disclosure in a healthy, sufficiently covered database for the selected period." },
  PARTIAL_DATA: { title: "No definitive result", description: "The available history or issuer mapping is incomplete, so an empty result cannot be treated as a verified zero." },
  SOURCE_TEMPORARILY_UNAVAILABLE: { title: "Political source temporarily unavailable", description: "The canonical database and live provider fallback could not return a reliable result. No zero has been inferred." },
  DATABASE_UNAVAILABLE: { title: "Political database unavailable", description: "The canonical political dataset is not available in this environment. Provider responses alone cannot verify a zero result." },
  UNRESOLVED_ASSET: { title: "Asset identity unresolved", description: "Kairo could not safely link this symbol to a canonical issuer or instrument, so no political activity has been attributed." },
};

export function PoliticalEmptyState({ report, onSelectPeriod }: { report: PoliticalIntelligenceReport; onSelectPeriod: (period: PoliticalPeriod) => void }) {
  const message = copy[report.dataStatus];
  const Icon = report.dataStatus === "VERIFIED_ZERO" ? CheckCircle2 : report.dataStatus === "UNRESOLVED_ASSET" ? SearchX : report.dataStatus === "DATABASE_UNAVAILABLE" ? Database : AlertTriangle;
  const alternatives = report.availablePeriods.filter((period) => period !== report.period);
  return <section className="card p-6" role="status">
    <div className="flex items-start gap-4">
      <span className="section-pill"><Icon size={16}/>{report.dataStatus.replaceAll("_", " ")}</span>
      <div className="min-w-0 flex-1">
        <h2 className="text-xl font-bold">{message.title}</h2>
        <p className="muted mt-2 text-sm">{message.description}</p>
        {report.activityOutsideSelectedPeriod && <p className="mt-3 text-sm font-semibold">Activity exists outside the selected {report.period} window.</p>}
        {alternatives.length > 0 && <div className="mt-4 flex flex-wrap gap-2">{alternatives.map((period) => <button className="button-outline" key={period} onClick={() => onSelectPeriod(period)}>View {period}</button>)}</div>}
        <p className="muted mt-4 text-xs">Resolution: {report.canonicalResolution?.matchStrategy.replaceAll("_", " ") ?? "UNAVAILABLE"} · source: {report.provenance.sourceMode.replaceAll("_", " ")} · database: {report.provenance.databaseStatus.replaceAll("_", " ")}.</p>
      </div>
    </div>
  </section>;
}
