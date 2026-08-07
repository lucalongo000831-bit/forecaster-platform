import "server-only";

import { Ratelimit } from "@upstash/ratelimit";
import { AppError } from "./app-error";
import { getRedis, privacySafeKey } from "./redis";

interface LocalBucket { count: number; resetAt: number }
const localBuckets = new Map<string, LocalBucket>();
const distributedLimiters = new Map<string, Ratelimit>();
const MAX_LOCAL_BUCKETS = 5_000;

export interface RateLimitPolicy {
  scope: string;
  limit: number;
  windowSeconds?: number;
}

export async function enforceRateLimit(identifier: string, policy: RateLimitPolicy) {
  const windowSeconds = policy.windowSeconds ?? 60;
  const safeIdentifier = privacySafeKey(identifier);
  const remote = getRedis();
  if (remote) {
    const cacheKey = `${policy.scope}:${policy.limit}:${windowSeconds}`;
    let limiter = distributedLimiters.get(cacheKey);
    if (!limiter) {
      limiter = new Ratelimit({
        redis: remote,
        limiter: Ratelimit.slidingWindow(policy.limit, `${windowSeconds} s`),
        prefix: `ratelimit:${policy.scope}`,
        analytics: false,
      });
      distributedLimiters.set(cacheKey, limiter);
    }
    const result = await limiter.limit(safeIdentifier);
    if (!result.success) {
      const retryAfter = Math.max(1, Math.ceil((result.reset - Date.now()) / 1_000));
      throw new AppError("RATE_LIMITED", "Troppe richieste. Riprova più tardi", 429, true, retryAfter);
    }
    return;
  }

  const now = Date.now();
  const key = `${policy.scope}:${safeIdentifier}`;
  const bucket = localBuckets.get(key);
  if (!bucket || bucket.resetAt <= now) {
    if (localBuckets.size >= MAX_LOCAL_BUCKETS) {
      for (const [bucketKey, candidate] of localBuckets) {
        if (candidate.resetAt <= now) localBuckets.delete(bucketKey);
      }
      while (localBuckets.size >= MAX_LOCAL_BUCKETS) {
        const oldestKey = localBuckets.keys().next().value as string | undefined;
        if (!oldestKey) break;
        localBuckets.delete(oldestKey);
      }
    }
    localBuckets.set(key, { count: 1, resetAt: now + windowSeconds * 1_000 });
    return;
  }
  if (bucket.count >= policy.limit) {
    throw new AppError("RATE_LIMITED", "Troppe richieste. Riprova più tardi", 429, true, Math.max(1, Math.ceil((bucket.resetAt - now) / 1_000)));
  }
  bucket.count += 1;
}
