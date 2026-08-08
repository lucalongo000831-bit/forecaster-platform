import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/server/auth";
import { getProviderHealth } from "@/providers/health";
import { getEnvironmentStatus } from "@/schemas/env";

export const dynamic = "force-dynamic";

function value(value: string | number | null) { return value === null ? "Not observed" : String(value); }

export default async function ProviderPreferencesPage() {
  const user = await getCurrentUser().catch(() => null);
  if (!user) redirect("/login?next=/preferences/providers");
  const environment = getEnvironmentStatus();
  const configured = { yahoo: true, fmp: environment.fmpConfigured, "alpha-vantage": environment.alphaVantageConfigured, massive: environment.massiveConfigured };
  return <div className="container-shell page-stack"><header><span className="page-kicker">Preferences / Operations</span><h1 className="page-title">Provider health.</h1><p className="muted mt-3">Runtime state only. Credentials and upstream endpoint details are never displayed.</p></header><section className="grid-2">{getProviderHealth().map((item) => <article className="card p-6" key={item.provider}><div className="section-row"><h2 className="text-xl font-bold capitalize">{item.provider}</h2><span className={`badge ${item.healthy === false ? "badge-sell" : item.healthy ? "badge-buy" : "badge-hold"}`}>{item.healthy === null ? "NOT CHECKED" : item.healthy ? "HEALTHY" : "DEGRADED"}</span></div><dl className="mt-5 grid grid-cols-2 gap-3 text-sm"><dt className="muted">Configured</dt><dd>{configured[item.provider] ? "Yes" : "No"}</dd><dt className="muted">Last success</dt><dd>{value(item.lastSuccess)}</dd><dt className="muted">Last error</dt><dd>{value(item.lastError)}</dd><dt className="muted">Latency</dt><dd>{item.latencyMs === null ? "Not observed" : `${item.latencyMs} ms`}</dd><dt className="muted">Last data timestamp</dt><dd>{value(item.lastDataTimestamp)}</dd></dl></article>)}</section><section className="soft-card p-5"><strong>Kairo AI</strong><p className="muted mt-1">Status: DISABLED. The implementation is preserved behind ENABLE_KAIRO_AI.</p></section></div>;
}
