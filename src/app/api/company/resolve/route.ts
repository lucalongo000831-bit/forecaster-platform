import { financialProviderRouter } from "@/providers";
import { queryObject, searchRequestSchema } from "@/schemas";
import { createRequestContext } from "@/lib/server/request-context";
import { enforceRateLimit } from "@/lib/server/rate-limit";
import { jsonFailure, jsonSuccess } from "@/lib/server/api-response";

export const runtime = "nodejs"; export const dynamic = "force-dynamic";
export async function GET(request: Request) { const context = createRequestContext(request); try { await enforceRateLimit(context.ip, { scope: "company:resolve", limit: 20 }); const { q } = searchRequestSchema.parse(queryObject(request)); const result = await financialProviderRouter.search(q); return jsonSuccess(result.data, context, { headers: { "Cache-Control": "public, s-maxage=300, stale-while-revalidate=1800" }, meta: { ...result.meta } }); } catch (error) { return jsonFailure(error, context); } }
