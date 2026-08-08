import { z } from "zod";
import { financialProviderRouter } from "@/providers";
import { queryObject } from "@/schemas";
import { createRequestContext } from "@/lib/server/request-context";
import { enforceRateLimit } from "@/lib/server/rate-limit";
import { jsonFailure, jsonSuccess } from "@/lib/server/api-response";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const requestSchema = z.object({ symbol: z.string().trim().min(1).max(32).optional(), chamber: z.enum(["all", "senate", "house"]).default("all"), limit: z.coerce.number().int().min(1).max(200).default(100) });

export async function GET(request: Request) {
  const context = createRequestContext(request);
  try {
    await enforceRateLimit(context.ip, { scope: "market:political", limit: 15 });
    const { symbol, chamber, limit } = requestSchema.parse(queryObject(request));
    const [senate, house] = await Promise.all([
      chamber === "house" ? Promise.resolve(null) : financialProviderRouter.senateTrades(symbol, limit),
      chamber === "senate" ? Promise.resolve(null) : financialProviderRouter.houseTrades(symbol, limit),
    ]);
    const data = [...(senate?.data ?? []), ...(house?.data ?? [])].sort((a, b) => b.transactionDate.localeCompare(a.transactionDate));
    return jsonSuccess(data.slice(0, limit), context, { headers: { "Cache-Control": "public, s-maxage=3600, stale-while-revalidate=21600" }, meta: { provider: "fmp", fetchedAt: new Date().toISOString(), freshnessType: senate?.meta.freshnessType ?? house?.meta.freshnessType ?? "UNAVAILABLE" } });
  } catch (error) { return jsonFailure(error, context); }
}
