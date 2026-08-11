import "server-only";

import { ingestCftcPositioning, ingestFredEconomicData, ingestFredReleaseCalendar, ingestMarketauxNews } from "@/services/data-v2";
import { getGlobalRiskCurrent } from "@/services/global-risk";
import { syncPoliticalDisclosures } from "@/services/political";
import { runJob } from "./job-runner";

export const DATA_V2_SCHEDULES = {
  economic: process.env.KAIRO_SCHEDULE_ECONOMIC ?? "0 */6 * * *",
  calendar: process.env.KAIRO_SCHEDULE_CALENDAR ?? "15 */6 * * *",
  political: process.env.KAIRO_SCHEDULE_POLITICAL ?? "30 */6 * * *",
  cftc: process.env.KAIRO_SCHEDULE_CFTC ?? "0 22 * * 5",
  news: process.env.KAIRO_SCHEDULE_NEWS ?? "*/15 * * * *",
  globalRisk: process.env.KAIRO_SCHEDULE_GLOBAL_RISK ?? "*/15 * * * *",
} as const;

export const DATA_V2_JOB_NAMES = ["economic", "calendar", "political", "cftc", "news", "global-risk"] as const;
export type DataV2JobName = typeof DATA_V2_JOB_NAMES[number];

function monthWindow() { const now = new Date(); return { from: new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)).toISOString().slice(0, 10), to: new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 3, 0)).toISOString().slice(0, 10) }; }

export function runDataV2Job(name: DataV2JobName) {
  const window = monthWindow();
  if (name === "economic") return runJob("data-v2-economic", () => ingestFredEconomicData(), { timeoutMs: 240_000, lockSeconds: 300 });
  if (name === "calendar") return runJob("data-v2-calendar", () => ingestFredReleaseCalendar(window.from, window.to), { timeoutMs: 120_000, lockSeconds: 180 });
  if (name === "political") return runJob("data-v2-political", () => syncPoliticalDisclosures({ limit: 500 }), { timeoutMs: 240_000, lockSeconds: 300 });
  if (name === "cftc") return runJob("data-v2-cftc", () => ingestCftcPositioning(), { timeoutMs: 180_000, lockSeconds: 300 });
  if (name === "news") return runJob("data-v2-news", () => ingestMarketauxNews(), { timeoutMs: 120_000, lockSeconds: 180 });
  return runJob("data-v2-global-risk", () => getGlobalRiskCurrent({ force: true }), { timeoutMs: 180_000, lockSeconds: 180 });
}
