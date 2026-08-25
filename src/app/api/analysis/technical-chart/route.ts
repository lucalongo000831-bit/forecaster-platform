import { getTechnicalChartDataset } from "@/services/analysis/technical-chart-service";
import { queryObject, technicalChartRequestSchema } from "@/schemas";
import { createRequestContext } from "@/lib/server/request-context";
import { enforceRateLimit } from "@/lib/server/rate-limit";
import { jsonFailure } from "@/lib/server/api-response";
import { providerApiSuccess } from "@/services/market/api";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const context = createRequestContext(request);
  try {
    await enforceRateLimit(context.ip, { scope: "analysis:technical-chart", limit: 30 });
    const { symbol, timeframe } = technicalChartRequestSchema.parse(queryObject(request));
    const result = await getTechnicalChartDataset(symbol, timeframe);
    const intraday = ["1m", "5m", "15m", "30m", "1h", "4h"].includes(timeframe);
    return providerApiSuccess(result, context, intraday ? "public, s-maxage=10, stale-while-revalidate=60" : "public, s-maxage=900, stale-while-revalidate=21600");
  } catch (error) {
    return jsonFailure(error, context);
  }
}
