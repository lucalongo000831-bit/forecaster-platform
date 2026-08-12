import { Activity, Database, ShieldCheck } from "lucide-react";
import { getDataArchitectureHealth } from "@/services/data-v2";
import { getSchedulerHeartbeats } from "@/services/jobs";

export const dynamic = "force-dynamic";

export default async function DataQualityV2Page() {
  const [health, heartbeats] = await Promise.all([getDataArchitectureHealth(), getSchedulerHeartbeats()]);
  return <div className="container-shell page-stack"><header><span className="page-kicker">Preferences / Data operations</span><h1 className="page-title">Data quality V2.</h1><p className="muted mt-3">Persisted coverage, last-known-good state and scheduler health. Credentials and authenticated provider URLs are never displayed.</p></header>
    <section className="grid-3"><article className="metric-card mint"><Database/><div><span className="small-label">Database</span><div className="kpi mt-3">{health.database}</div></div></article><article className="metric-card violet"><ShieldCheck/><div><span className="small-label">Overall</span><div className="kpi mt-3">{health.overall}</div></div></article><article className="metric-card amber"><Activity/><div><span className="small-label">Schedulers healthy</span><div className="kpi mt-3">{heartbeats.filter((item) => item.status === "HEALTHY").length}/{heartbeats.length}</div></div></article></section>
    <section className="card overflow-hidden"><div className="p-6"><h2 className="text-xl font-bold">Critical datasets</h2></div><div className="overflow-x-auto"><table className="data-table"><thead><tr><th>Dataset</th><th>Status</th><th>Records</th><th>Coverage</th><th>LKG</th><th>Calculated</th><th>Anomalies</th></tr></thead><tbody>{health.datasets.map((item) => <tr key={item.dataset}><td>{item.dataset}</td><td>{item.status}</td><td>{item.recordCount ?? "—"}</td><td>{item.coverage === null ? "—" : `${item.coverage.toFixed(1)}%`}</td><td>{item.hasLastKnownGood ? "YES" : "NO"}</td><td>{item.calculatedAt ?? "—"}</td><td>{item.anomalies.join(", ") || "—"}</td></tr>)}</tbody></table></div></section>
    <section className="card overflow-hidden"><div className="p-6"><h2 className="text-xl font-bold">Scheduler heartbeat</h2></div><div className="overflow-x-auto"><table className="data-table"><thead><tr><th>Job</th><th>Status</th><th>Expected</th><th>Last start</th><th>Next expected</th><th>Run result</th></tr></thead><tbody>{heartbeats.map((item) => <tr key={item.name}><td>{item.name}</td><td>{item.status}</td><td>{item.expectedMinutes} min</td><td>{item.lastStartedAt ?? "Never"}</td><td>{item.nextExpectedAt ?? "—"}</td><td>{item.lastStatus ?? "—"}</td></tr>)}</tbody></table></div></section>
  </div>;
}
