import { NextResponse } from "next/server";
import { deterministicE2ENetworkAudit } from "@/providers/testing/provider-network-audit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const audit = deterministicE2ENetworkAudit();
  if (!audit.enabled) return new NextResponse(null, { status: 404 });
  return NextResponse.json({ data: audit }, { headers: { "Cache-Control": "no-store" } });
}
