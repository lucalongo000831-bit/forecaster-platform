import "server-only";

interface CacheEntry<T> {
  value?: T;
  expiresAt: number;
  staleUntil: number;
  pending?: Promise<T>;
}

export interface CachePolicy {
  freshMs: number;
  staleMs: number;
}

export interface CacheResult<T> {
  value: T;
  stale: boolean;
}

const store = new Map<string, CacheEntry<unknown>>();
const MAX_ENTRIES = 500;

function prune(now: number) {
  if (store.size <= MAX_ENTRIES) return;
  for (const [key, entry] of store) {
    if (entry.staleUntil <= now && !entry.pending) store.delete(key);
  }
  while (store.size > MAX_ENTRIES) {
    const first = store.keys().next().value as string | undefined;
    if (!first) break;
    store.delete(first);
  }
}

export async function cached<T>(key: string, policy: CachePolicy, loader: () => Promise<T>): Promise<CacheResult<T>> {
  const now = Date.now();
  const existing = store.get(key) as CacheEntry<T> | undefined;
  if (existing?.value !== undefined && existing.expiresAt > now) return { value: existing.value, stale: false };

  if (existing?.value !== undefined && existing.staleUntil > now) {
    if (!existing.pending) {
      existing.pending = loader()
        .then((value) => {
          store.set(key, { value, expiresAt: Date.now() + policy.freshMs, staleUntil: Date.now() + policy.freshMs + policy.staleMs });
          return value;
        })
        .catch(() => existing.value as T)
        .finally(() => { existing.pending = undefined; });
    }
    return { value: existing.value, stale: true };
  }

  if (existing?.pending) return { value: await existing.pending, stale: false };
  const pending = loader();
  store.set(key, { ...existing, expiresAt: 0, staleUntil: 0, pending });
  try {
    const value = await pending;
    store.set(key, { value, expiresAt: Date.now() + policy.freshMs, staleUntil: Date.now() + policy.freshMs + policy.staleMs });
    prune(now);
    return { value, stale: false };
  } catch (error) {
    store.delete(key);
    throw error;
  }
}
