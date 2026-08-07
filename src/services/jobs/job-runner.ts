import "server-only";

import { createHash } from "node:crypto";
import { eq } from "drizzle-orm";
import { calculationRuns, getDatabase, isDatabaseConfigured } from "@/db";
import { structuredLog } from "@/lib/server/logger";
import { withDistributedLock } from "@/lib/server/redis";

const localJobs = new Set<string>();
export interface JobResult<T> { status: "completed" | "skipped" | "failed"; result: T | null; durationMs: number; }

async function withTimeout<T>(task: Promise<T>, timeoutMs: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try { return await Promise.race([task, new Promise<T>((_, reject) => { timer = setTimeout(() => reject(new Error("JOB_TIMEOUT")), timeoutMs); })]); }
  finally { if (timer) clearTimeout(timer); }
}

export async function runJob<T>(name: string, task: () => Promise<T>, options: { timeoutMs?: number; lockSeconds?: number } = {}): Promise<JobResult<T>> {
  const startedAt = Date.now(); const timeoutMs = options.timeoutMs ?? 50_000; const lockSeconds = options.lockSeconds ?? 60;
  if (localJobs.has(name)) return { status: "skipped", result: null, durationMs: 0 };
  localJobs.add(name); let runId: string | null = null;
  try {
    if (isDatabaseConfigured()) {
      const inputHash = createHash("sha256").update(`${name}:${new Date().toISOString().slice(0, 16)}`).digest("hex");
      const [run] = await getDatabase().insert(calculationRuns).values({ operation: `job:${name}`, inputHash, status: "RUNNING", startedAt: new Date(), metadata: { runtime: "vercel-node" } }).onConflictDoNothing({ target: [calculationRuns.operation, calculationRuns.inputHash] }).returning({ id: calculationRuns.id });
      if (!run) return { status: "skipped", result: null, durationMs: Date.now() - startedAt };
      runId = run.id;
    }
    const locked = await withDistributedLock(`job:${name}`, lockSeconds, () => withTimeout(task(), timeoutMs));
    if (locked === null) {
      const durationMs = Date.now() - startedAt;
      if (runId) await getDatabase().update(calculationRuns).set({ status: "COMPLETED", completedAt: new Date(), durationMs, metadata: { runtime: "vercel-node", skipped: "lock-not-acquired" } }).where(eq(calculationRuns.id, runId));
      structuredLog("info", "job.skipped", { job: name, durationMs, status: "skipped", reason: "lock-not-acquired" });
      return { status: "skipped", result: null, durationMs };
    }
    const durationMs = Date.now() - startedAt;
    if (runId) await getDatabase().update(calculationRuns).set({ status: "COMPLETED", completedAt: new Date(), durationMs }).where(eq(calculationRuns.id, runId));
    structuredLog("info", "job.completed", { job: name, durationMs, status: "completed" });
    return { status: "completed", result: locked, durationMs };
  } catch (error) {
    const durationMs = Date.now() - startedAt; const code = error instanceof Error ? error.message.slice(0, 80) : "UNKNOWN";
    if (runId) await getDatabase().update(calculationRuns).set({ status: "FAILED", completedAt: new Date(), durationMs, errorCode: code }).where(eq(calculationRuns.id, runId)).catch(() => undefined);
    structuredLog("error", "job.failed", { job: name, durationMs, status: "failed", code });
    return { status: "failed", result: null, durationMs };
  } finally { localJobs.delete(name); }
}
