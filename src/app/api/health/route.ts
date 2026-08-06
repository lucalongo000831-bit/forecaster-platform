import { createRequestContext, jsonSuccess } from "@/lib/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const context = createRequestContext(request);
  return jsonSuccess({ status: "ok", service: "forecaster-platform", timestamp: new Date().toISOString() }, context, {
    headers: { "Cache-Control": "no-store" },
  });
}
