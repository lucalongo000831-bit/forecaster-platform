import { createRequestContext, jsonSuccess } from "@/lib/server";
import { getDataArchitectureHealth } from "@/services/data-v2";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const context = createRequestContext(request);
  const architecture = await getDataArchitectureHealth();
  return jsonSuccess({ status: architecture.database === "AVAILABLE" ? architecture.overall === "OK" ? "ok" : "degraded" : "degraded", service: "forecaster-platform", timestamp: new Date().toISOString(), database: architecture.database, criticalDatasets: architecture.datasets }, context, {
    headers: { "Cache-Control": "no-store" },
  });
}
