import "server-only";

import { desc, like } from "drizzle-orm";
import { calculationRuns, getDatabase, isDatabaseConfigured } from "@/db";

export type SchedulerHeartbeatStatus = "HEALTHY" | "LATE" | "MISSED" | "FAILED" | "DISABLED";
const expectedMinutes: Record<string, number> = { "data-v2-economic": 360, "data-v2-calendar": 360, "data-v2-political": 360, "data-v2-energy": 360, "data-v2-cftc": 10_080, "data-v2-news": 15, "data-v2-global-risk": 15 };

export function classifyHeartbeat(input: { enabled: boolean; lastStartedAt: Date | null; lastStatus: string | null; expectedMinutes: number }, now = new Date()): SchedulerHeartbeatStatus {
  if (!input.enabled) return "DISABLED";
  if (input.lastStatus === "FAILED") return "FAILED";
  if (!input.lastStartedAt) return "MISSED";
  const age = (now.getTime() - input.lastStartedAt.getTime()) / 60_000;
  if (age > input.expectedMinutes * 2) return "MISSED";
  if (age > input.expectedMinutes * 1.25) return "LATE";
  return "HEALTHY";
}

export async function getSchedulerHeartbeats(now = new Date()) {
  const names = Object.keys(expectedMinutes);
  if (!isDatabaseConfigured()) return names.map((name) => ({ name, expectedMinutes: expectedMinutes[name]!, lastStartedAt: null, nextExpectedAt: null, lastStatus: null, status: "DISABLED" as const }));
  const rows = await getDatabase().select().from(calculationRuns).where(like(calculationRuns.operation, "job:data-v2-%")).orderBy(desc(calculationRuns.startedAt)).limit(200);
  return names.map((name) => { const row = rows.find((item) => item.operation === `job:${name}`); const expected = expectedMinutes[name]!; return { name, expectedMinutes: expected, lastStartedAt: row?.startedAt.toISOString() ?? null, nextExpectedAt: row ? new Date(row.startedAt.getTime() + expected * 60_000).toISOString() : null, lastStatus: row?.status ?? null, status: classifyHeartbeat({ enabled: true, lastStartedAt: row?.startedAt ?? null, lastStatus: row?.status ?? null, expectedMinutes: expected }, now) }; });
}
