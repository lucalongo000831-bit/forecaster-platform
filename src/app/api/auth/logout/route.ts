import { destroySession } from "@/lib/server/auth";
import { assertSameOrigin } from "@/lib/server/csrf";
import { createRequestContext } from "@/lib/server/request-context";
import { jsonFailure, jsonSuccess } from "@/lib/server/api-response";
export const runtime = "nodejs"; export const dynamic = "force-dynamic";
export async function POST(request: Request) { const context = createRequestContext(request); try { assertSameOrigin(request); await destroySession(); return jsonSuccess({ loggedOut: true }, context, { headers: { "Cache-Control": "no-store" } }); } catch (error) { return jsonFailure(error, context); } }
