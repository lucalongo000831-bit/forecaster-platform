import { getCurrentUser } from "@/lib/server/auth";
import { createRequestContext } from "@/lib/server/request-context";
import { jsonFailure, jsonSuccess } from "@/lib/server/api-response";
export const runtime = "nodejs"; export const dynamic = "force-dynamic";
export async function GET(request: Request) { const context = createRequestContext(request); try { return jsonSuccess(await getCurrentUser(), context, { headers: { "Cache-Control": "no-store" } }); } catch (error) { return jsonFailure(error, context); } }
