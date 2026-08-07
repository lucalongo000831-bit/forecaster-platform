import { z } from "zod";
import { runCompanyDcfScenario } from "@/engines/company";
import { parseJsonBody } from "@/lib/server/account-route";
import { jsonFailure, jsonSuccess } from "@/lib/server/api-response";
import { requireUser } from "@/lib/server/auth";
import { assertSameOrigin } from "@/lib/server/csrf";
import { enforceRateLimit } from "@/lib/server/rate-limit";
import { createRequestContext } from "@/lib/server/request-context";
import { getServerEnvironment } from "@/schemas/env";
import { symbolSchema } from "@/schemas";
import { getCompanyIntelligence } from "@/services/company";

const inputSchema = z.object({ name: z.enum(["BEAR", "BASE", "BULL"]).default("BASE"), growth: z.number().min(-0.5).max(0.5), discountRate: z.number().min(0.04).max(0.3), terminalGrowth: z.number().min(-0.02).max(0.06), operatingMargin: z.number().min(-1).max(1).nullable().default(null) }).refine((value) => value.discountRate > value.terminalGrowth + 0.01, { message: "Discount rate must exceed terminal growth by at least 1%." });
export const runtime = "nodejs"; export const dynamic = "force-dynamic"; export const maxDuration = 30;
export async function POST(request: Request, route: { params: Promise<{ symbol: string }> }) { const context = createRequestContext(request); try { await enforceRateLimit(context.ip, { scope: "company:custom-dcf", limit: 3, windowSeconds: 300 }); assertSameOrigin(request); if (getServerEnvironment().NODE_ENV === "production") await requireUser(); const symbol = symbolSchema.parse(decodeURIComponent((await route.params).symbol)); const assumptions = inputSchema.parse(await parseJsonBody(request)); const report = await getCompanyIntelligence(symbol); const latest = report.historical.find((item) => item.period === "annual"); if (!latest?.freeCashFlow || !latest.dilutedShares || report.currentPrice === null) throw new Error("Verified FCF, diluted shares and price are required."); const scenario = runCompanyDcfScenario({ ...assumptions, fcf: latest.freeCashFlow, shares: latest.dilutedShares, netDebt: latest.netDebt ?? 0, currentPrice: report.currentPrice, margin: assumptions.operatingMargin }); return jsonSuccess(scenario, context, { headers: { "Cache-Control": "no-store" }, meta: { modelVersion: report.valuationVersion, classification: "SCENARIO" } }); } catch (error) { return jsonFailure(error, context); } }
