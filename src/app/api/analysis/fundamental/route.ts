import { analyzeFundamentals } from "@/engines/fundamental";
import { financialProviderRouter } from "@/providers";
import { queryObject, symbolRequestSchema } from "@/schemas";
import { createRequestContext } from "@/lib/server/request-context";
import { enforceRateLimit } from "@/lib/server/rate-limit";
import { jsonFailure, jsonSuccess } from "@/lib/server/api-response";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const context = createRequestContext(request);
  try {
    await enforceRateLimit(context.ip, { scope: "analysis:fundamental", limit: 10 });
    const { symbol } = symbolRequestSchema.parse(queryObject(request));
    const [summary, income, balanceSheet, cashFlow, ratios, analyst] = await Promise.all([
      financialProviderRouter.fundamentals(symbol),
      financialProviderRouter.statements(symbol, "income", "annual", 6).catch(() => null),
      financialProviderRouter.statements(symbol, "balance-sheet", "annual", 6).catch(() => null),
      financialProviderRouter.statements(symbol, "cash-flow", "annual", 6).catch(() => null),
      financialProviderRouter.ratios(symbol, "annual", 6).catch(() => null),
      financialProviderRouter.analystConsensus(symbol).catch(() => null),
    ]);
    const analysis = analyzeFundamentals({ symbol: symbol.toUpperCase(), summary: summary.data, income: income?.data, balanceSheet: balanceSheet?.data, cashFlow: cashFlow?.data, ratios: ratios?.data, analyst: analyst?.data, source: summary.meta.provider });
    return jsonSuccess(analysis, context, { headers: { "Cache-Control": "public, s-maxage=21600, stale-while-revalidate=172800" }, meta: { provider: summary.meta.provider, sourceTimestamp: analysis.dataTimestamp, modelVersion: analysis.modelVersion, dataQuality: analysis.confidence } });
  } catch (error) { return jsonFailure(error, context); }
}
