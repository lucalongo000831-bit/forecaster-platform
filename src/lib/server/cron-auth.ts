import "server-only";

import { timingSafeEqual } from "node:crypto";
import { getServerEnvironment } from "@/schemas/env";
import { AppError } from "./app-error";

function secretsMatch(received: string, expected: string | undefined) {
  if (!expected || !received) return false;
  const left = Buffer.from(received);
  const right = Buffer.from(expected);
  return left.length === right.length && timingSafeEqual(left, right);
}

export function assertCronRequest(request: Request) {
  const bearer = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ?? "";
  if (secretsMatch(bearer, getServerEnvironment().CRON_SECRET)) return;

  // Vercel verifies this same system secret at the deployment-protection edge.
  // Accept it only on Preview so an authenticated `vercel curl` can run the
  // protected operational checks without downloading application secrets.
  const previewBypass = request.headers.get("x-vercel-protection-bypass") ?? "";
  if (process.env.VERCEL_ENV === "preview" && secretsMatch(previewBypass, process.env.VERCEL_AUTOMATION_BYPASS_SECRET)) return;

  throw new AppError("FORBIDDEN", "Cron non autorizzato", 403);
}
