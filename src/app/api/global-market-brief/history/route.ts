import { createRequestContext, jsonFailure, jsonSuccess } from "@/lib/server";
import { requireUser } from "@/lib/server/auth";
import { editorialBriefProvider } from "@/services/editorial";
export const runtime = "nodejs"; export const dynamic = "force-dynamic";
export async function GET(request: Request) { const context = createRequestContext(request); try { const admin = new URL(request.url).searchParams.get("admin") === "1"; if (admin) await requireUser(); return jsonSuccess(await editorialBriefProvider.getHistory({ includeDrafts: admin, limit: 50 }), context, { headers: { "Cache-Control": admin ? "private, no-store" : "public, s-maxage=60, stale-while-revalidate=300" } }); } catch (error) { return jsonFailure(error, context); } }
