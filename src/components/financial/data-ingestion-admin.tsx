"use client";

import { useState } from "react";
import { DatabaseZap, Play, RefreshCw } from "lucide-react";

type Health = { overall: string; database: string; datasets: Array<{ dataset: string; status: string; recordCount: number | null; coverage: number | null; calculatedAt: string | null; hasLastKnownGood: boolean; anomalies: string[] }>; runs: Array<{ id: string; jobName: string; provider: string | null; status: string; startedAt: string; fetched: number; inserted: number; errors: number }> };
type PoliticalV3Status = { database: string; schema: string; transactionSources: number; historyMonths: number; logicalDuplicates: number | null; multiSourceTransactions: number | null; conflicts: number | null; health: { totalRecords: number; historyDays: number; earliestDisclosure: string | null; latestDisclosure: string | null } };
type PoliticalBackfillBatch = { status?: string; complete?: boolean; nextPage?: number; fetched?: number; processed?: number; monthCoverage?: unknown[]; dryRun?: boolean };

const jobs = ["economic", "calendar", "central-bank", "political", "energy", "cftc", "news", "global-risk"] as const;
const jobLabels: Record<typeof jobs[number], string> = { economic: "Refresh Economic Data", calendar: "Refresh Macro Calendar", "central-bank": "Refresh Central Bank Calendar", political: "Refresh Political Data", energy: "Refresh Energy Data", cftc: "Refresh CFTC Positioning", news: "Refresh News", "global-risk": "Recalculate Global Risk" };

export function DataIngestionAdmin({ initial }: { initial: Health }) {
  const today = new Date().toISOString().slice(0, 10);
  const [health, setHealth] = useState(initial);
  const [busy, setBusy] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [politicalProgress, setPoliticalProgress] = useState<string | null>(null);
  const [political, setPolitical] = useState<PoliticalV3Status | null>(null);
  const [source, setSource] = useState<"capitol-exposed" | "bargo">("capitol-exposed");
  const [from, setFrom] = useState("2025-08-01");
  const [to, setTo] = useState(today);
  const [batchDays, setBatchDays] = useState(30);
  const [resume, setResume] = useState(true);
  const [dryRun, setDryRun] = useState(false);

  async function refresh() {
    const response = await fetch("/api/admin/data-ingestion", { cache: "no-store" });
    const body = await response.json() as { data?: Health; error?: { message?: string } };
    if (!response.ok || !body.data) throw new Error(body.error?.message ?? "Health unavailable");
    setHealth(body.data);
  }

  async function run(job: typeof jobs[number]) {
    setBusy(job); setMessage(null);
    try {
      const response = await fetch("/api/admin/data-ingestion", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ job }) });
      const body = await response.json() as { data?: { status?: string }; error?: { message?: string } };
      if (!response.ok) throw new Error(body.error?.message ?? "Job failed");
      setMessage(`${job}: ${body.data?.status ?? "completed"}`);
      await refresh();
    } catch (error) { setMessage(error instanceof Error ? error.message : "Job failed"); }
    finally { setBusy(null); }
  }

  async function refreshPolitical(announce = true) {
    const response = await fetch("/api/admin/political-v3/backfill", { cache: "no-store" });
    const body = await response.json() as { data?: PoliticalV3Status; error?: { message?: string } };
    if (!response.ok || !body.data) throw new Error(body.error?.message ?? "Political V3 status unavailable");
    setPolitical(body.data);
    if (announce) setPoliticalProgress(body.data.schema === "CURRENT" ? "Schema CURRENT. Ready: press Run Political V3 backfill to start or resume the historical scan." : "Apply the additive V3 migration before starting the historical scan.");
  }

  async function migratePolitical() {
    setBusy("political-v3-migration"); setMessage(null); setPoliticalProgress(null);
    try {
      const response = await fetch("/api/admin/political-v3/backfill", { method: "PUT" });
      const body = await response.json() as { error?: { message?: string } };
      if (!response.ok) throw new Error(body.error?.message ?? "Migration failed");
      setPoliticalProgress("Political V3 additive migration verified. You can now run the historical backfill.");
      await refreshPolitical(false);
    } catch (error) { setPoliticalProgress(error instanceof Error ? error.message : "Migration failed"); }
    finally { setBusy(null); }
  }

  async function requestPoliticalBatch(iteration: number) {
    const response = await fetch("/api/admin/political-v3/backfill", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ source, from, to, batchDays, resume: iteration === 1 ? resume : true, dryRun, maxPages: 2, pageSize: 50 }),
    });
    const body = await response.json() as { data?: PoliticalBackfillBatch; error?: { message?: string } };
    if (!response.ok || !body.data) throw new Error(body.error?.message ?? "Political V3 backfill failed");
    return body.data;
  }

  async function backfillPolitical() {
    setBusy("political-v3-backfill"); setMessage(null);
    let totalFetched = 0; let totalProcessed = 0;
    try {
      for (let iteration = 1; iteration <= 125; iteration += 1) {
        setPoliticalProgress(`Historical scan running — batch ${iteration}, fetched ${totalFetched}, processed ${totalProcessed}. Keep this page open.`);
        const batch = await requestPoliticalBatch(iteration);
        totalFetched += batch.fetched ?? 0; totalProcessed += batch.processed ?? 0;
        await refreshPolitical(false);
        if (dryRun || batch.complete) {
          setPoliticalProgress(dryRun ? `Dry run completed: fetched ${totalFetched}, processed ${totalProcessed}. No records were written.` : `Historical backfill completed: fetched ${totalFetched}, processed ${totalProcessed}. Monthly coverage has been updated.`);
          await refresh();
          return;
        }
        setPoliticalProgress(`Batch ${iteration} saved. Resuming automatically from page ${batch.nextPage ?? "checkpoint"}…`);
      }
      setPoliticalProgress(`Backfill paused safely after 125 batches: fetched ${totalFetched}, processed ${totalProcessed}. Press Run again to resume from the saved checkpoint.`);
    } catch (error) {
      setPoliticalProgress(`${error instanceof Error ? error.message : "Political V3 backfill failed"}. Progress already saved; press Run again to resume from the checkpoint.`);
    } finally { setBusy(null); }
  }

  return <div className="container-shell page-stack">
    <header className="section-row"><div><span className="page-kicker">Preferences / Data operations</span><h1 className="page-title">Data ingestion.</h1><p className="muted mt-3">Persistent datasets, last-known-good state and manual, lock-protected jobs.</p></div><button className="button-outline" onClick={() => { void refresh(); void refreshPolitical(); }}><RefreshCw size={16}/>Refresh</button></header>
    {message && <section className="soft-card p-4"><strong>{message}</strong></section>}
    <section className="grid-3"><article className="soft-card p-5"><DatabaseZap/><strong className="mt-3 block">Database {health.database}</strong><small className="muted">Overall {health.overall}</small></article>{health.datasets.map((item) => <article className="soft-card p-5" key={item.dataset}><span className="small-label">{item.dataset}</span><strong className="mt-2 block">{item.status}</strong><small className="muted">{item.recordCount ?? "—"} records · coverage {item.coverage?.toFixed(0) ?? "—"}% · LKG {item.hasLastKnownGood ? "YES" : "NO"}</small></article>)}</section>
    <section className="card p-6"><h2 className="text-xl font-bold">Political V3 historical backfill</h2><p className="muted mt-2 text-sm">Runs only the resumable Political history operation. It never starts the other Kairo ingestion jobs.</p>
      <div className="settings-fields mt-5 grid gap-4 md:grid-cols-3"><label>Source<select className="modal-input" value={source} onChange={(event) => setSource(event.target.value as typeof source)}><option value="capitol-exposed">CapitolExposed</option><option value="bargo">Bargo</option></select></label><label>From<input type="date" value={from} onChange={(event) => setFrom(event.target.value)}/></label><label>To<input type="date" value={to} onChange={(event) => setTo(event.target.value)}/></label><label>Batch window (days)<input type="number" min={7} max={90} value={batchDays} onChange={(event) => setBatchDays(Number(event.target.value))}/></label><label className="flex items-center gap-2"><input type="checkbox" checked={resume} onChange={(event) => setResume(event.target.checked)}/>Resume from checkpoint</label><label className="flex items-center gap-2"><input type="checkbox" checked={dryRun} onChange={(event) => setDryRun(event.target.checked)}/>Dry run</label></div>
      <div className="mt-5 flex flex-wrap gap-3"><button className="button-outline" disabled={Boolean(busy)} onClick={() => void refreshPolitical()}><RefreshCw size={15}/>Check schema and coverage</button>{political?.schema === "MIGRATION_REQUIRED" && <button className="button-outline" disabled={Boolean(busy)} onClick={() => void migratePolitical()}>Apply additive V3 migration</button>}<button className="button-primary" disabled={Boolean(busy) || political?.schema !== "CURRENT"} onClick={() => void backfillPolitical()}><Play size={15}/>{busy === "political-v3-backfill" ? "Running…" : dryRun ? "Run Political V3 dry run" : "Run Political V3 backfill"}</button></div>
      {politicalProgress && <div className="soft-card mt-5 p-4" aria-live="polite"><strong>{politicalProgress}</strong></div>}
      {political && <div className="soft-card mt-5 p-4"><strong>Schema {political.schema}</strong><p className="muted mt-1 text-xs">{political.health.totalRecords} transactions · {political.health.historyDays} history days · {political.historyMonths} scanned months · {political.transactionSources} provenance rows · {political.logicalDuplicates ?? "—"} logical duplicates · {political.conflicts ?? "—"} conflicts.</p></div>}
    </section>
    <section className="card p-6"><h2 className="text-xl font-bold">Manual run</h2><p className="muted mt-2 text-sm">Runs are rate-limited, idempotent and protected by distributed locks.</p><div className="mt-5 flex flex-wrap gap-3">{jobs.map((job) => <button className="button-outline" disabled={Boolean(busy)} onClick={() => void run(job)} key={job}><Play size={15}/>{busy === job ? "Running…" : jobLabels[job]}</button>)}</div></section>
    <section className="card overflow-hidden"><div className="ci-table-wrap"><table className="ci-table"><thead><tr><th>Job</th><th>Status</th><th>Started</th><th>Fetched</th><th>Inserted</th><th>Errors</th></tr></thead><tbody>{health.runs.length ? health.runs.map((run) => <tr key={run.id}><td>{run.jobName}<small>{run.provider ?? "internal"}</small></td><td>{run.status}</td><td>{new Date(run.startedAt).toLocaleString()}</td><td>{run.fetched}</td><td>{run.inserted}</td><td>{run.errors}</td></tr>) : <tr><td colSpan={6}>No persisted runs yet.</td></tr>}</tbody></table></div></section>
  </div>;
}
