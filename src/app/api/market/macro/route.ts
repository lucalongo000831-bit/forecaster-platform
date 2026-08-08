import { z } from "zod";
import { financialProviderRouter } from "@/providers";
import { queryObject } from "@/schemas";
import { createRequestContext } from "@/lib/server/request-context";
import { enforceRateLimit } from "@/lib/server/rate-limit";
import { jsonFailure } from "@/lib/server/api-response";
import { providerApiSuccess } from "@/services/market/api";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const requestSchema = z.object({ indicator: z.enum(["INFLATION", "RATES", "GDP", "EMPLOYMENT"]) });

export async function GET(request: Request) {
  const context = createRequestContext(request);
  try {
    await enforceRateLimit(context.ip, { scope: "market:macro", limit: 15 });
    const { indicator } = requestSchema.parse(queryObject(request));
    return providerApiSuccess(await financialProviderRouter.macroIndicator(indicator), context, "public, s-maxage=21600, stale-while-revalidate=86400");
  } catch (error) { return jsonFailure(error, context); }
}
