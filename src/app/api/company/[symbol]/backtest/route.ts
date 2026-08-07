import { z } from "zod";
import { executeBacktest } from "@/services/backtest/backtest-service";
import { executeCompanyDecisionValidation } from "@/services/company";
import { parseJsonBody } from "@/lib/server/account-route";
import { jsonFailure, jsonSuccess } from "@/lib/server/api-response";
import { requireUser } from "@/lib/server/auth";
import { assertSameOrigin } from "@/lib/server/csrf";
import { AppError } from "@/lib/server/app-error";
import { enforceRateLimit } from "@/lib/server/rate-limit";
import { createRequestContext } from "@/lib/server/request-context";
import { getServerEnvironment } from "@/schemas/env";
import { backtestRequestSchema, symbolSchema } from "@/schemas";
import { normalizeSymbol } from "@/services/yahoo/symbol-resolver";

const decisionValidationSchema = z.object({ mode: z.literal("DECISION_VALIDATION"), from: z.iso.date(), to: z.iso.date() }).refine((value) => value.from < value.to && (new Date(value.to).getTime() - new Date(value.from).getTime()) / 86_400_000 <= 5_500, { message: "Intervallo di validazione non valido o superiore a 15 anni" });
const requestSchema = z.union([decisionValidationSchema, backtestRequestSchema]);

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;

export async function POST(request: Request, route: { params: Promise<{ symbol: string }> }) {
  const context = createRequestContext(request);
  try {
    await enforceRateLimit(context.ip, { scope: "company:backtest", limit: 2, windowSeconds: 60 });
    assertSameOrigin(request);
    const env = getServerEnvironment();
    if (env.NODE_ENV === "production") {
      if (!env.ENABLE_BACKTEST_API) throw new AppError("NOT_CONFIGURED", "Backtest API non abilitata in produzione", 503);
      await requireUser();
    }
    const symbol = normalizeSymbol(symbolSchema.parse(decodeURIComponent((await route.params).symbol)));
    const configuration = requestSchema.parse(await parseJsonBody(request));
    if ("mode" in configuration) {
      const output = await executeCompanyDecisionValidation(symbol, configuration.from, configuration.to);
      return jsonSuccess(output.result, context, { headers: { "Cache-Control": "no-store" }, meta: { providers: output.providers, modelVersion: output.result.modelVersion } });
    }
    if (normalizeSymbol(configuration.symbol) !== symbol) throw new AppError("BAD_REQUEST", "Il ticker nel percorso non coincide con quello della configurazione", 400);
    const output = await executeBacktest(configuration);
    return jsonSuccess(output.result, context, { headers: { "Cache-Control": "no-store" }, meta: { runId: output.runId, providers: output.providers, modelVersion: output.result.modelVersion } });
  } catch (error) {
    return jsonFailure(error, context);
  }
}
