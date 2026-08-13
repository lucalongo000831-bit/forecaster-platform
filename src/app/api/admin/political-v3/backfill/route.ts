import { z } from "zod";
import { assertSameOrigin, createRequestContext, enforceRateLimit, jsonFailure, jsonSuccess, parseJsonBody, requireAdmin } from "@/lib/server";
import { applyAdditivePoliticalV3Migration, backfillPoliticalHistoryV3, getPoliticalV3QualityDiagnostics } from "@/services/political";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

const inputSchema = z.object({
  from: z.iso.date(), to: z.iso.date(), source: z.enum(["bargo", "capitol-exposed"]).default("capitol-exposed"), resume: z.boolean().default(true), dryRun: z.boolean().default(false), batchDays: z.number().int().min(7).max(90).default(30), maxPages: z.number().int().min(1).max(5).default(2), pageSize: z.number().int().min(10).max(100).default(50), chamber: z.enum(["HOUSE", "SENATE"]).optional(),
}).refine((value) => value.from <= value.to, "Invalid backfill window");

export async function POST(request: Request) {
  const context = createRequestContext(request);
  try { assertSameOrigin(request); const user = await requireAdmin(); await enforceRateLimit(`${context.ip}:${user.id}`, { scope: "admin:political-v3-backfill", limit: 180, windowSeconds: 3_600 }); const input = inputSchema.parse(await parseJsonBody(request)); return jsonSuccess(await backfillPoliticalHistoryV3(input), context, { headers: { "Cache-Control": "private, no-store" } }); }
  catch (error) { return jsonFailure(error, context); }
}

export async function GET(request: Request) {
  const context = createRequestContext(request);
  try { await requireAdmin(); return jsonSuccess(await getPoliticalV3QualityDiagnostics(), context, { headers: { "Cache-Control": "private, no-store" } }); }
  catch (error) { return jsonFailure(error, context); }
}

export async function PUT(request: Request) {
  const context = createRequestContext(request);
  try { assertSameOrigin(request); const user = await requireAdmin(); await enforceRateLimit(`${context.ip}:${user.id}`, { scope: "admin:political-v3-migration", limit: 2, windowSeconds: 900 }); return jsonSuccess(await applyAdditivePoliticalV3Migration(), context, { headers: { "Cache-Control": "private, no-store" } }); }
  catch (error) { return jsonFailure(error, context); }
}
