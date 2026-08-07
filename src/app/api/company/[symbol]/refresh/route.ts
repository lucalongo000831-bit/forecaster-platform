import { assertSameOrigin } from "@/lib/server/csrf";
import { requireUser } from "@/lib/server/auth";
import { jsonFailure, jsonSuccess } from "@/lib/server/api-response";
import { enforceRateLimit } from "@/lib/server/rate-limit";
import { createRequestContext } from "@/lib/server/request-context";
import { getServerEnvironment } from "@/schemas/env";
import { symbolSchema } from "@/schemas";
import { getCompanyIntelligence, invalidateCompanyAnalysis } from "@/services/company";

export const runtime = "nodejs"; export const dynamic = "force-dynamic"; export const maxDuration = 30;
export async function POST(request: Request, route: { params: Promise<{ symbol: string }> }) { const context = createRequestContext(request); try { await enforceRateLimit(context.ip, { scope: "company:refresh", limit: 2, windowSeconds: 300 }); assertSameOrigin(request); if (getServerEnvironment().NODE_ENV === "production") await requireUser(); const symbol = symbolSchema.parse(decodeURIComponent((await route.params).symbol)); await invalidateCompanyAnalysis(symbol); const report = await getCompanyIntelligence(symbol, { refresh: true }); return jsonSuccess(report, context, { headers: { "Cache-Control": "no-store" }, meta: { modelVersion: report.modelVersion } }); } catch (error) { return jsonFailure(error, context); } }
