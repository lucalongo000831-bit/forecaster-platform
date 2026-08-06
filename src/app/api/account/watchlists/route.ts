import { createRequestContext } from "@/lib/server/request-context";
import { requireAccount } from "@/lib/server/account-route";
import { jsonFailure, jsonSuccess } from "@/lib/server/api-response";
import { watchlistCreateSchema } from "@/schemas";
import { createWatchlist, listWatchlists } from "@/services/account";
export const runtime = "nodejs"; export const dynamic = "force-dynamic";
export async function GET(request: Request) { const context = createRequestContext(request); try { const user = await requireAccount(request, context); return jsonSuccess(await listWatchlists(user.id), context, { headers: { "Cache-Control": "private, no-store" } }); } catch (error) { return jsonFailure(error, context); } }
export async function POST(request: Request) { const context = createRequestContext(request); try { const user = await requireAccount(request, context, true); return jsonSuccess(await createWatchlist(user.id, watchlistCreateSchema.parse(await request.json())), context, { status: 201, headers: { "Cache-Control": "no-store" } }); } catch (error) { return jsonFailure(error, context); } }
