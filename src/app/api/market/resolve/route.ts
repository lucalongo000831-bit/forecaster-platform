import { financialProviderRouter } from "@/providers";
import { queryObject, resolveRequestSchema } from "@/schemas";
import { createRequestContext } from "@/lib/server/request-context";
import { enforceRateLimit } from "@/lib/server/rate-limit";
import { jsonFailure, jsonSuccess } from "@/lib/server/api-response";
import { marketSlug, normalizeSymbol } from "@/services/yahoo/symbol-resolver";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const context = createRequestContext(request);
  try {
    await enforceRateLimit(context.ip, { scope: "market:resolve", limit: 30 });
    const input = resolveRequestSchema.parse(queryObject(request));
    const symbol = normalizeSymbol(input.symbol);
    const [quote, profile] = await Promise.all([financialProviderRouter.quote(symbol), financialProviderRouter.profile(symbol).catch(() => null)]);
    return jsonSuccess({
      symbol: quote.data.symbol,
      name: profile?.data.name ?? quote.data.name,
      exchange: quote.data.exchange,
      market: input.market ?? marketSlug(quote.data.exchange, quote.data.quoteType),
      currency: quote.data.currency,
      quoteType: quote.data.quoteType,
      providerSymbols: { yahoo: symbol, fmp: symbol, massive: quote.data.exchange === "US" ? symbol : null },
      slug: encodeURIComponent(symbol.toLowerCase()),
    }, context, { headers: { "Cache-Control": "public, s-maxage=86400, stale-while-revalidate=604800" }, meta: { ...quote.meta } });
  } catch (error) { return jsonFailure(error, context); }
}
