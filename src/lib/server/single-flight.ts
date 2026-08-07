import "server-only";

export interface SingleFlight<Key, Value> {
  run(key: Key, task: () => Promise<Value>): Promise<Value>;
  readonly size: number;
}

/** Coalesces identical work inside one Node.js process without retaining results. */
export function createSingleFlight<Key, Value>(): SingleFlight<Key, Value> {
  const pending = new Map<Key, Promise<Value>>();
  return {
    run(key, task) {
      const existing = pending.get(key);
      if (existing) return existing;
      const current = Promise.resolve().then(task).finally(() => pending.delete(key));
      pending.set(key, current);
      return current;
    },
    get size() { return pending.size; },
  };
}
