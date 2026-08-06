import { getMarketCalendar } from "@/services/calendar/calendar-service";
import { calendarRequestSchema, queryObject } from "@/schemas";
import { createRequestContext } from "@/lib/server/request-context";
import { enforceRateLimit } from "@/lib/server/rate-limit";
import { jsonFailure, jsonSuccess } from "@/lib/server/api-response";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const context = createRequestContext(request);
  try { await enforceRateLimit(context.ip, { scope: "calendar", limit: 10 }); const input = calendarRequestSchema.parse(queryObject(request)); const data = await getMarketCalendar(input.from, input.to, input.symbol); return jsonSuccess(data, context, { headers: { "Cache-Control": "public, s-maxage=600, stale-while-revalidate=3600" }, meta: { sourceTimestamp: data.calculatedAt, providers: Object.values(data.availability).flatMap((item) => item.provider ? [item.provider] : []) } }); }
  catch (error) { return jsonFailure(error, context); }
}
