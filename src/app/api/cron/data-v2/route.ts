import { z } from "zod";
import { assertCronRequest, createRequestContext, jsonFailure, jsonSuccess } from "@/lib/server";
import { DATA_V2_JOB_NAMES, runDataV2Job } from "@/services/jobs";
export const runtime = "nodejs"; export const dynamic = "force-dynamic"; export const maxDuration = 300;
export async function GET(request: Request) { const context = createRequestContext(request); try { assertCronRequest(request); const job = z.enum(DATA_V2_JOB_NAMES).parse(new URL(request.url).searchParams.get("job")); return jsonSuccess(await runDataV2Job(job), context, { headers: { "Cache-Control": "no-store" } }); } catch (error) { return jsonFailure(error, context); } }
