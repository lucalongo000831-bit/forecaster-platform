import "server-only";

import { timingSafeEqual } from "node:crypto";
import { getServerEnvironment } from "@/schemas/env";
import { AppError } from "./app-error";

export function assertCronRequest(request: Request) {
  const expected = getServerEnvironment().CRON_SECRET;
  const received = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ?? "";
  if (!expected || !received) throw new AppError("FORBIDDEN", "Cron non autorizzato", 403);
  const left = Buffer.from(received); const right = Buffer.from(expected);
  if (left.length !== right.length || !timingSafeEqual(left, right)) throw new AppError("FORBIDDEN", "Cron non autorizzato", 403);
}
