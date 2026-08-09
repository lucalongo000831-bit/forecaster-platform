import { redirect } from "next/navigation";
import { BookOpen, Database, ShieldCheck } from "lucide-react";
import { getCurrentUser } from "@/lib/server/auth";
import { getCryptoDataBundle, getEtfDataBundle } from "@/services/financial/data-bundle-service";
import { normalizeSymbol } from "@/services/yahoo/symbol-resolver";
import type { FieldProvenance, MissingDataReason } from "@/providers";
import type { MissingDataDetail } from "@/types";
import { resolveInstrument } from "@/services/instruments/instrument-resolver";
import { getCompanyIntelligence } from "@/services/company";
import type { CompanyCoverageReport } from "@/types";

export const dynamic = "force-dynamic";

function safeSymbol(value: string | undefined) {
  if (!value) return null;
  try { return normalizeSymbol(decodeURIComponent(value)); } catch { return null; }
}

function reasonLabel(reason: MissingDataReason) {
  return reason.replaceAll("_", " ");
}

export default async function DataLineagePage({ searchParams }: { searchParams: Promise<{ symbol?: string }> }) {
  const user = await getCurrentUser().catch(() => null);
  if (!user) redirect("/login?next=/preferences/data-lineage");
  const symbol = safeSymbol((await searchParams).symbol);
  let lineage: FieldProvenance[] = []; let missing: MissingDataDetail[] = []; let kind = "—"; let warning: string | null = null; let coverage: CompanyCoverageReport | null = null;
  if (symbol) {
    try {
      const resolved = await resolveInstrument(symbol);
      if (resolved.kind === "CRYPTO") { const bundle = await getCryptoDataBundle(symbol); lineage = bundle.provenance; missing = bundle.missing; kind = bundle.instrument.kind; }
      else if (resolved.kind === "ETF") { const bundle = await getEtfDataBundle(symbol); lineage = bundle.provenance; missing = bundle.missing; kind = bundle.instrument.kind; }
      else { const report = await getCompanyIntelligence(symbol); lineage = report.fieldProvenance ?? []; missing = report.missingData ?? []; kind = resolved.kind; coverage = report.coverage ?? null; }
    } catch { warning = "Impossibile costruire il lineage in questo momento. I provider potrebbero essere temporaneamente indisponibili."; }
  }
  return <div className="container-shell page-stack"><header><span className="page-kicker">Preferences / Data operations</span><h1 className="page-title">Data lineage.</h1><p className="muted mt-3">Provenienza campo-per-campo, calcoli e motivi espliciti dei dati mancanti. Nessuna credenziale o URL autenticato viene mostrato.</p></header>
    <form className="card flex flex-wrap items-end gap-3 p-5" method="get"><label className="min-w-64 flex-1"><span className="small-label">Ticker o listing</span><input className="mt-2 w-full rounded-xl border border-[var(--border)] bg-transparent px-4 py-3" name="symbol" defaultValue={symbol ?? ""} placeholder="AAPL, STLAM.MI, BTC-USD"/></label><button className="primary-button" type="submit">Analizza lineage</button></form>
    {warning && <section className="soft-card p-5"><strong>{warning}</strong></section>}
    {!symbol && <section className="grid-3"><article className="card p-6"><Database size={20}/><h2 className="mt-4 font-bold">Fonte</h2><p className="muted mt-2 text-sm">Provider effettivamente usato e timestamp della fonte.</p></article><article className="card p-6"><BookOpen size={20}/><h2 className="mt-4 font-bold">Formula</h2><p className="muted mt-2 text-sm">Formula deterministica e input per ogni campo calcolato.</p></article><article className="card p-6"><ShieldCheck size={20}/><h2 className="mt-4 font-bold">Qualità</h2><p className="muted mt-2 text-sm">Qualità, conflitti e motivo preciso di ogni assenza.</p></article></section>}
    {symbol && <><section className="soft-card p-5"><strong>{symbol}</strong><span className="muted ml-3">{kind} · {lineage.length} campi tracciati · {missing.length} gap provider espliciti</span></section>{coverage && <section className="card p-6"><div className="ci-inline-title"><strong>{symbol} COVERAGE</strong><span>Raw {coverage.rawDataCoverage.toFixed(1)}% · Applicable {coverage.applicableDataCoverage.toFixed(1)}%</span></div><div className="ci-metric-grid mt-5">{coverage.sections.map((section) => <div className="ci-metric" key={section.section}><span>{section.section}</span><strong>{section.percentage.toFixed(0)}%</strong><small>{section.available}/{section.applicable} · {section.status}</small></div>)}</div></section>}<section className="card overflow-hidden"><div className="ci-table-wrap"><table className="ci-table"><thead><tr><th>Campo</th><th>Provider</th><th>Tipo fonte</th><th>Periodo / timestamp</th><th>Valuta</th><th>Calcolo / input</th><th>Stato</th></tr></thead><tbody>{lineage.length ? lineage.map((item, index) => <tr key={`${item.field}-${item.provider}-${index}`}><td title={item.sourceConcept ?? undefined}>{item.field}</td><td>{item.provider}</td><td>{item.provider === "calculated" ? "CALCULATED" : item.accessionNumber ? "OFFICIAL_FILING" : "STRUCTURED_PROVIDER"}</td><td>{item.sourceTimestamp ?? "Non dichiarato"}</td><td>{item.currency ?? "—"}</td><td>{item.formula ?? item.inputs?.join(", ") ?? "Dato diretto"}</td><td>{item.quality}</td></tr>) : <tr><td colSpan={7}>Nessun campo disponibile.</td></tr>}</tbody></table></div></section>{coverage && coverage.missingFields.length > 0 && <section className="card p-6"><h2 className="text-xl font-bold">Gap field-by-field</h2><div className="ci-limitations mt-4">{coverage.fields.filter((item) => item.status !== "AVAILABLE" && item.status !== "NOT_APPLICABLE").map((item) => <p key={item.field}><strong>{item.field}</strong> · {item.status} · {item.reason}</p>)}</div></section>}{missing.length > 0 && <section className="card p-6"><h2 className="text-xl font-bold">Errori e limiti provider</h2><div className="ci-limitations mt-4">{missing.map((item) => <p key={item.field}><strong>{item.field}</strong> · {reasonLabel(item.reason)} · {item.message} Provider tentati: {item.attemptedProviders.join(", ")}.</p>)}</div></section>}</>}
  </div>;
}
