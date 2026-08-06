import { assertInternalRequest, createRequestContext, jsonFailure, jsonSuccess } from "@/lib/server";
import { getEnvironmentStatus } from "@/schemas/env";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const context = createRequestContext(request);
  try {
    assertInternalRequest(request);
    const status = getEnvironmentStatus();
    return jsonSuccess({
      yahooConfigured: true,
      fmpConfigured: status.fmpConfigured,
      alphaVantageConfigured: status.alphaVantageConfigured,
      massiveConfigured: status.massiveConfigured,
      checkedAt: new Date().toISOString(),
    }, context, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return jsonFailure(error, context);
  }
}
