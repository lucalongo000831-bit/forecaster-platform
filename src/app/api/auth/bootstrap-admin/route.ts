import { assertSameOrigin, bootstrapConfiguredAdministrator, createRequestContext, enforceRateLimit, jsonFailure, jsonSuccess, requireUser } from "@/lib/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const context = createRequestContext(request);
  try {
    assertSameOrigin(request);
    const user = await requireUser();
    await enforceRateLimit(`${context.ip}:${user.id}`, { scope: "auth:bootstrap-admin", limit: 3, windowSeconds: 900 });
    return jsonSuccess(await bootstrapConfiguredAdministrator(user), context, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    return jsonFailure(error, context);
  }
}
