import "server-only";

import { createHash, randomUUID } from "node:crypto";
import { Redis } from "@upstash/redis";
import { getServerEnvironment } from "@/schemas/env";

let redis: Redis | null | undefined;
const localCache = new Map<string, { value: unknown; expiresAt: number }>();

export function getRedis(): Redis | null {
  if (redis !== undefined) return redis;
  const env = getServerEnvironment();
  redis = env.UPSTASH_REDIS_REST_URL && env.UPSTASH_REDIS_REST_TOKEN
    ? new Redis({ url: env.UPSTASH_REDIS_REST_URL, token: env.UPSTASH_REDIS_REST_TOKEN })
    : null;
  return redis;
}

export function privacySafeKey(value: string): string {
  return createHash("sha256").update(value).digest("hex").slice(0, 32);
}

export async function cacheGet<T>(key: string): Promise<T | null> {
  const remote = getRedis();
  if (remote) return remote.get<T>(key);
  const entry = localCache.get(key);
  if (!entry || entry.expiresAt <= Date.now()) {
    localCache.delete(key);
    return null;
  }
  return entry.value as T;
}

export async function cacheSet<T>(key: string, value: T, ttlSeconds: number): Promise<void> {
  const remote = getRedis();
  if (remote) {
    await remote.set(key, value, { ex: Math.max(1, Math.floor(ttlSeconds)) });
    return;
  }
  localCache.set(key, { value, expiresAt: Date.now() + ttlSeconds * 1_000 });
  if (localCache.size > 1_000) {
    const now = Date.now();
    for (const [entryKey, entry] of localCache) if (entry.expiresAt <= now) localCache.delete(entryKey);
  }
}

export async function cacheDelete(key: string): Promise<void> {
  const remote = getRedis();
  if (remote) await remote.del(key);
  else localCache.delete(key);
}

export async function withDistributedLock<T>(key: string, ttlSeconds: number, task: () => Promise<T>): Promise<T | null> {
  const remote = getRedis();
  if (!remote) return task();
  const token = randomUUID();
  const acquired = await remote.set(`lock:${key}`, token, { nx: true, ex: ttlSeconds });
  if (!acquired) return null;
  try {
    return await task();
  } finally {
    const current = await remote.get<string>(`lock:${key}`);
    if (current === token) await remote.del(`lock:${key}`);
  }
}
