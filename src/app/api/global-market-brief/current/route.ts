import { createRequestContext, jsonFailure, jsonSuccess } from "@/lib/server";
import { editorialBriefProvider } from "@/services/editorial";
export const runtime = "nodejs"; export const dynamic = "force-dynamic";
export async function GET(request: Request) { const context = createRequestContext(request); try { return jsonSuccess(await editorialBriefProvider.getCurrent(), context, { headers: { "Cache-Control": "public, s-maxage=60, stale-while-revalidate=300" } }); } catch (error) { return jsonFailure(error, context); } }
