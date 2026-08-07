import { assertCronRequest, createRequestContext, jsonFailure, jsonSuccess } from "@/lib/server";
import { runAlertEvaluationJob } from "@/services/jobs";
export const runtime = "nodejs"; export const dynamic = "force-dynamic"; export const maxDuration = 60;
export async function GET(request: Request) { const context = createRequestContext(request); try { assertCronRequest(request); return jsonSuccess(await runAlertEvaluationJob(), context, { headers: { "Cache-Control": "no-store" } }); } catch (error) { return jsonFailure(error, context); } }
