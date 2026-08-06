import "server-only";

import { FinancialDataError } from "./errors";

interface Bucket { count: number; resetsAt: number }
const buckets = new Map<string, Bucket>();

export function clientKey(request: Request): string {
  const forwarded = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  return forwarded || request.headers.get("x-real-ip") || "local";
}

export function enforceRateLimit(key: string, scope: string, limit: number, windowMs = 60_000) {
  const now = Date.now();
  const id = `${scope}:${key}`;
  const bucket = buckets.get(id);
  if (!bucket || bucket.resetsAt <= now) {
    buckets.set(id, { count: 1, resetsAt: now + windowMs });
    return;
  }
  if (bucket.count >= limit) {
    throw new FinancialDataError("RATE_LIMITED", "Troppe richieste. Attendi qualche secondo e riprova.", 429);
  }
  bucket.count += 1;
  if (buckets.size > 2_000) {
    for (const [bucketKey, value] of buckets) if (value.resetsAt <= now) buckets.delete(bucketKey);
  }
}
