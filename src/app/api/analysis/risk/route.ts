import { riskRequestSchema } from "@/schemas";
import { getRiskPlan } from "@/services/analysis/risk-service";
import { createRequestContext } from "@/lib/server/request-context";
import { enforceRateLimit } from "@/lib/server/rate-limit";
import { jsonFailure, jsonSuccess } from "@/lib/server/api-response";
import { parseJsonBody } from "@/lib/server/account-route";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const context = createRequestContext(request);
  try {
    await enforceRateLimit(context.ip, { scope: "analysis:risk", limit: 12 });
    const input = riskRequestSchema.parse(await parseJsonBody(request));
    const result = await getRiskPlan(input);
    return jsonSuccess(result.plan, context, { headers: { "Cache-Control": "no-store" }, meta: { provider: result.provider, modelVersion: result.plan.modelVersion } });
  } catch (error) { return jsonFailure(error, context); }
}
