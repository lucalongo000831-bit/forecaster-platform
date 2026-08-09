import { redirect } from "next/navigation";
import { BookOpen, Database, ShieldCheck } from "lucide-react";
import { getCurrentUser } from "@/lib/server/auth";
import { getAnalysisDataBundle, getCryptoDataBundle, getEtfDataBundle } from "@/services/financial/data-bundle-service";
import { normalizeSymbol } from "@/services/yahoo/symbol-resolver";
import type { FieldProvenance, MissingDataReason } from "@/providers";
import type { MissingDataDetail } from "@/types";
import { resolveInstrument } from "@/services/instruments/instrument-resolver";

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
  let lineage: FieldProvenance[] = []; let missing: MissingDataDetail[] = []; let kind = "—"; let warning: string | null = null;
  if (symbol) {
    try {
      const resolved = await resolveInstrument(symbol);
      const bundle = resolved.kind === "CRYPTO" ? await getCryptoDataBundle(symbol) : resolved.kind === "ETF" ? await getEtfDataBundle(symbol) : await getAnalysisDataBundle(symbol);
      lineage = bundle.provenance; missing = bundle.missing; kind = bundle.instrument.kind;
    } catch { warning = "Impossibile costruire il lineage in questo momento. I provider potrebbero essere temporaneamente indisponibili."; }
  }
  return <div className="container-shell page-stack"><header><span className="page-kicker">Preferences / Data operations</span><h1 className="page-title">Data lineage.</h1><p className="muted mt-3">Provenienza campo-per-campo, calcoli e motivi espliciti dei dati mancanti. Nessuna credenziale o URL autenticato viene mostrato.</p></header>
    <form className="card flex flex-wrap items-end gap-3 p-5" method="get"><label className="min-w-64 flex-1"><span className="small-label">Ticker o listing</span><input className="mt-2 w-full rounded-xl border border-[var(--border)] bg-transparent px-4 py-3" name="symbol" defaultValue={symbol ?? ""} placeholder="AAPL, STLAM.MI, BTC-USD"/></label><button className="primary-button" type="submit">Analizza lineage</button></form>
    {warning && <section className="soft-card p-5"><strong>{warning}</strong></section>}
    {!symbol && <section className="grid-3"><article className="card p-6"><Database size={20}/><h2 className="mt-4 font-bold">Fonte</h2><p className="muted mt-2 text-sm">Provider effettivamente usato e timestamp della fonte.</p></article><article className="card p-6"><BookOpen size={20}/><h2 className="mt-4 font-bold">Formula</h2><p className="muted mt-2 text-sm">Formula deterministica e input per ogni campo calcolato.</p></article><article className="card p-6"><ShieldCheck size={20}/><h2 className="mt-4 font-bold">Qualità</h2><p className="muted mt-2 text-sm">Qualità, conflitti e motivo preciso di ogni assenza.</p></article></section>}
    {symbol && <><section className="soft-card p-5"><strong>{symbol}</strong><span className="muted ml-3">{kind} · {lineage.length} campi tracciati · {missing.length} gap espliciti</span></section><section className="card overflow-hidden"><div className="ci-table-wrap"><table className="ci-table"><thead><tr><th>Campo</th><th>Provider</th><th>Timestamp fonte</th><th>Qualità</th><th>Formula / input</th></tr></thead><tbody>{lineage.length ? lineage.map((item, index) => <tr key={`${item.field}-${item.provider}-${index}`}><td>{item.field}</td><td>{item.provider}</td><td>{item.sourceTimestamp ?? "Non dichiarato"}</td><td>{item.quality}</td><td>{item.formula ?? item.inputs?.join(", ") ?? "Dato diretto"}</td></tr>) : <tr><td colSpan={5}>Nessun campo disponibile.</td></tr>}</tbody></table></div></section>{missing.length > 0 && <section className="card p-6"><h2 className="text-xl font-bold">Gap residui</h2><div className="ci-limitations mt-4">{missing.map((item) => <p key={item.field}><strong>{item.field}</strong> · {reasonLabel(item.reason)} · {item.message} Provider tentati: {item.attemptedProviders.join(", ")}.</p>)}</div></section>}</>}
  </div>;
}
