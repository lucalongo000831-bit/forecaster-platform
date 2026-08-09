import { z } from "zod";
import { politicalPeriodSchema } from "@/schemas";
import { getPoliticianActivity } from "@/services/political";
import { AppError, createRequestContext, enforceRateLimit, jsonFailure, jsonSuccess } from "@/lib/server";

export const runtime = "nodejs"; export const dynamic = "force-dynamic";

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const context = createRequestContext(request);
  try {
    await enforceRateLimit(context.ip, { scope: "political-politician", limit: 30 }); const { id } = await params;
    const period = politicalPeriodSchema.catch("1Y").parse(new URL(request.url).searchParams.get("period") ?? "1Y"); const safeId = z.string().trim().min(3).max(220).parse(decodeURIComponent(id));
    const report = await getPoliticianActivity(safeId, period); if (!report) throw new AppError("NOT_FOUND", "Politician disclosure profile not found", 404, false);
    return jsonSuccess(report, context, { headers: { "Cache-Control": "public, s-maxage=21600, stale-while-revalidate=86400" }, meta: { provider: "fmp", modelVersion: report.summary.modelVersion } });
  } catch (error) { return jsonFailure(error, context); }
}
