import { createRequestContext, enforceRateLimit, jsonFailure, jsonSuccess } from "@/lib/server";
import { getPoliticalSyncHealth } from "@/services/political";
export const runtime = "nodejs"; export const dynamic = "force-dynamic";
export async function GET(request: Request) { const context = createRequestContext(request); try { await enforceRateLimit(context.ip, { scope: "political-health", limit: 20 }); return jsonSuccess(await getPoliticalSyncHealth(), context, { headers: { "Cache-Control": "private, max-age=60" } }); } catch (error) { return jsonFailure(error, context); } }
