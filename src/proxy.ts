import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { canonicalizeLegacyCryptoPathname } from "@/lib/instrument-identity";

export function proxy(request: NextRequest) {
  const pathname = canonicalizeLegacyCryptoPathname(request.nextUrl.pathname);
  if (!pathname) return NextResponse.next();
  const canonical = request.nextUrl.clone();
  canonical.pathname = pathname;
  return NextResponse.redirect(canonical, 308);
}

export const config = {
  matcher: "/instrument/:path*",
};
