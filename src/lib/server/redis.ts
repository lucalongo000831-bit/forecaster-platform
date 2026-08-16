import "server-only";

import { createHash, randomUUID } from "node:crypto";
import { Redis } from "@upstash/redis";
import { getServerEnvironment } from "@/schemas/env";

let redis: Redis | null | undefined;
const localCache = new Map<string, { value: unknown; expiresAt: number }>();
const pendingRemoteReads = new Map<string, Promise<unknown | null>>();
const remoteOperationTimeoutMs = 500;
const remoteReadThroughTtlMs = 15_000;
const remoteCircuitBreakMs = 30_000;
let remoteUnavailableUntil = 0;

function localGet<T>(key: string): T | null {
  const entry = localCache.get(key);
  if (!entry || entry.expiresAt <= Date.now()) {
    localCache.delete(key);
    return null;
  }
  return entry.value as T;
}

function localSet<T>(key: string, value: T, ttlMs: number): void {
  localCache.set(key, { value, expiresAt: Date.now() + Math.max(1_000, ttlMs) });
  if (localCache.size <= 1_000) return;
  const now = Date.now();
  for (const [entryKey, entry] of localCache) if (entry.expiresAt <= now) localCache.delete(entryKey);
}

async function withinRemoteDeadline<T>(operation: Promise<T>): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      operation,
      new Promise<T>((_, reject) => {
        timer = setTimeout(() => reject(new Error("REDIS_OPERATION_TIMEOUT")), remoteOperationTimeoutMs);
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

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
  const local = localGet<T>(key);
  if (local !== null) return local;
  const remote = getRedis();
  if (!remote || remoteUnavailableUntil > Date.now()) return null;
  const existing = pendingRemoteReads.get(key) as Promise<T | null> | undefined;
  if (existing) return existing;
  const read = withinRemoteDeadline(remote.get<T>(key)).then((value) => {
    remoteUnavailableUntil = 0;
    if (value !== null) localSet(key, value, remoteReadThroughTtlMs);
    return value;
  }).catch(() => {
    remoteUnavailableUntil = Date.now() + remoteCircuitBreakMs;
    return null;
  }).finally(() => pendingRemoteReads.delete(key));
  pendingRemoteReads.set(key, read as Promise<unknown | null>);
  return read;
}

export async function cacheSet<T>(key: string, value: T, ttlSeconds: number): Promise<void> {
  localSet(key, value, ttlSeconds * 1_000);
  const remote = getRedis();
  if (!remote || remoteUnavailableUntil > Date.now()) return;
  await withinRemoteDeadline(remote.set(key, value, { ex: Math.max(1, Math.floor(ttlSeconds)) })).then(() => {
    remoteUnavailableUntil = 0;
  }).catch(() => {
    remoteUnavailableUntil = Date.now() + remoteCircuitBreakMs;
  });
}

export async function cacheDelete(key: string): Promise<void> {
  localCache.delete(key);
  const remote = getRedis();
  if (remote) await withinRemoteDeadline(remote.del(key)).catch(() => undefined);
}

export async function withDistributedLock<T>(key: string, ttlSeconds: number, task: () => Promise<T>): Promise<T | null> {
  const remote = getRedis();
  if (!remote) return task();
  const token = randomUUID();
  let acquired: string | null;
  try {
    acquired = await withinRemoteDeadline(remote.set(`lock:${key}`, token, { nx: true, ex: ttlSeconds }));
  } catch {
    return task();
  }
  if (!acquired) return null;
  try {
    return await task();
  } finally {
    const current = await withinRemoteDeadline(remote.get<string>(`lock:${key}`)).catch(() => null);
    if (current === token) await withinRemoteDeadline(remote.del(`lock:${key}`)).catch(() => undefined);
  }
}
