import { checkDatabaseConnection, isDatabaseConfigured } from "@/db/client";
import { assertInternalRequest, createRequestContext, jsonFailure, jsonSuccess } from "@/lib/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const context = createRequestContext(request);
  try {
    assertInternalRequest(request);
    const configured = isDatabaseConfigured();
    return jsonSuccess({ configured, reachable: configured ? await checkDatabaseConnection() : false, checkedAt: new Date().toISOString() }, context, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return jsonFailure(error, context);
  }
}
