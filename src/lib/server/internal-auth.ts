import "server-only";

import { timingSafeEqual } from "node:crypto";
import { getServerEnvironment } from "@/schemas/env";
import { AppError } from "./app-error";

function equalSecret(received: string, expected: string): boolean {
  const left = Buffer.from(received);
  const right = Buffer.from(expected);
  return left.length === right.length && timingSafeEqual(left, right);
}

export function assertInternalRequest(request: Request) {
  const configured = getServerEnvironment().INTERNAL_API_SECRET;
  const received = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ?? "";
  if (!configured || !received || !equalSecret(received, configured)) {
    throw new AppError("FORBIDDEN", "Accesso non autorizzato", 403);
  }
}
