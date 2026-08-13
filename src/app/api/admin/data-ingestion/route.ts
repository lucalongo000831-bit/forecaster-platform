import { z } from "zod";
import { assertSameOrigin, createRequestContext, enforceRateLimit, jsonFailure, jsonSuccess, parseJsonBody, requireAdmin } from "@/lib/server";
import { getDataArchitectureHealth } from "@/services/data-v2";
import { DATA_V2_JOB_NAMES, runDataV2Job } from "@/services/jobs";

export const runtime = "nodejs"; export const dynamic = "force-dynamic"; export const maxDuration = 300;

export async function GET(request: Request) { const context = createRequestContext(request); try { await requireAdmin(); return jsonSuccess(await getDataArchitectureHealth(), context, { headers: { "Cache-Control": "private, no-store" } }); } catch (error) { return jsonFailure(error, context); } }
export async function POST(request: Request) { const context = createRequestContext(request); try { assertSameOrigin(request); const user = await requireAdmin(); await enforceRateLimit(`${context.ip}:${user.id}`, { scope: "admin:data-ingestion", limit: 6, windowSeconds: 300 }); const input = z.object({ job: z.enum(DATA_V2_JOB_NAMES) }).parse(await parseJsonBody(request)); return jsonSuccess(await runDataV2Job(input.job), context, { headers: { "Cache-Control": "no-store" } }); } catch (error) { return jsonFailure(error, context); } }
