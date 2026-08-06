import "server-only";

import { NextResponse } from "next/server";
import type { ApiError, ApiSuccess, DataSource } from "@/types";
import { toFinancialDataError } from "./errors";

export function apiSuccess<T>(data: T, source: DataSource, fallback = false, message?: string) {
  const body: ApiSuccess<T> = { data, meta: { source, stale: false, fallback, message } };
  return NextResponse.json(body, {
    headers: {
      "Cache-Control": source === "yahoo"
        ? "public, s-maxage=30, stale-while-revalidate=120, stale-if-error=3600"
        : "private, no-store",
    },
  });
}

export function apiFailure(error: unknown) {
  const normalized = toFinancialDataError(error);
  const body: ApiError = { error: { code: normalized.code, message: normalized.message } };
  return NextResponse.json(body, { status: normalized.status, headers: { "Cache-Control": "no-store" } });
}
