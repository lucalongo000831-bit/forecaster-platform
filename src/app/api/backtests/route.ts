import { backtestRequestSchema } from "@/schemas";
import { executeBacktest } from "@/services/backtest/backtest-service";
import { getServerEnvironment } from "@/schemas/env";
import { AppError } from "@/lib/server/app-error";
import { requireUser } from "@/lib/server/auth";
import { createRequestContext } from "@/lib/server/request-context";
import { enforceRateLimit } from "@/lib/server/rate-limit";
import { jsonFailure, jsonSuccess } from "@/lib/server/api-response";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;

export async function POST(request: Request) {
  const context = createRequestContext(request);
  try {
    await enforceRateLimit(context.ip, { scope: "backtest", limit: 2, windowSeconds: 60 });
    const env = getServerEnvironment();
    if (env.NODE_ENV === "production") { if (!env.ENABLE_BACKTEST_API) throw new AppError("NOT_CONFIGURED", "Backtest API non abilitata in produzione", 503); await requireUser(); }
    if (Number(request.headers.get("content-length") ?? 0) > 16_384) throw new AppError("BAD_REQUEST", "Richiesta troppo grande", 413);
    const configuration = backtestRequestSchema.parse(await request.json()); const output = await executeBacktest(configuration);
    return jsonSuccess(output.result, context, { headers: { "Cache-Control": "no-store" }, meta: { runId: output.runId, providers: output.providers, modelVersion: output.result.modelVersion } });
  } catch (error) { return jsonFailure(error, context); }
}
