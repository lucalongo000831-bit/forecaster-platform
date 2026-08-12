import { z } from "zod";
import { assertSameOrigin, createRequestContext, enforceRateLimit, jsonFailure, jsonSuccess, parseJsonBody, requireAdmin } from "@/lib/server";
import { backfillPoliticalHistoryV3 } from "@/services/political";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

const inputSchema = z.object({
  from: z.iso.date(), to: z.iso.date(), resume: z.boolean().default(true), dryRun: z.boolean().default(false), batchDays: z.number().int().min(7).max(90).default(30), maxPages: z.number().int().min(1).max(250).default(60), pageSize: z.number().int().min(10).max(100).default(100), chamber: z.enum(["HOUSE", "SENATE"]).optional(),
}).refine((value) => value.from <= value.to, "Invalid backfill window");

export async function POST(request: Request) {
  const context = createRequestContext(request);
  try { assertSameOrigin(request); const user = await requireAdmin(); await enforceRateLimit(`${context.ip}:${user.id}`, { scope: "admin:political-v3-backfill", limit: 2, windowSeconds: 900 }); const input = inputSchema.parse(await parseJsonBody(request)); return jsonSuccess(await backfillPoliticalHistoryV3(input), context, { headers: { "Cache-Control": "private, no-store" } }); }
  catch (error) { return jsonFailure(error, context); }
}
