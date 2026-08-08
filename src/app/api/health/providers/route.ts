import { assertInternalRequest, createRequestContext, jsonFailure, jsonSuccess } from "@/lib/server";
import { getEnvironmentStatus } from "@/schemas/env";
import { getProviderHealth } from "@/providers/health";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const context = createRequestContext(request);
  try {
    assertInternalRequest(request);
    const status = getEnvironmentStatus();
    const configured = { yahoo: true, fmp: status.fmpConfigured, "alpha-vantage": status.alphaVantageConfigured, massive: status.massiveConfigured };
    return jsonSuccess({
      providers: getProviderHealth().map((provider) => ({ ...provider, configured: configured[provider.provider] })),
      kairoAi: "DISABLED",
      checkedAt: new Date().toISOString(),
    }, context, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return jsonFailure(error, context);
  }
}
