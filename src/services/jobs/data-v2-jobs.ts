import "server-only";

import { ingestCentralBankCalendar, ingestCftcPositioning, ingestEiaEnergyData, ingestFredEconomicData, ingestFredReleaseCalendar, ingestMarketauxNews } from "@/services/data-v2";
import { getMarketCalendar } from "@/services/calendar/calendar-service";
import { getGlobalRiskCurrent } from "@/services/global-risk";
import { backfillPoliticalDisclosures } from "@/services/political";
import { runJob } from "./job-runner";

export const DATA_V2_SCHEDULES = {
  economic: process.env.KAIRO_SCHEDULE_ECONOMIC ?? "0 6 * * *",
  calendar: process.env.KAIRO_SCHEDULE_CALENDAR ?? "15 6 * * *",
  centralBank: process.env.KAIRO_SCHEDULE_CENTRAL_BANK ?? "25 6 * * *",
  political: process.env.KAIRO_SCHEDULE_POLITICAL ?? "30 6 * * *",
  cftc: process.env.KAIRO_SCHEDULE_CFTC ?? "0 22 * * 5",
  news: process.env.KAIRO_SCHEDULE_NEWS ?? "0 7 * * *",
  globalRisk: process.env.KAIRO_SCHEDULE_GLOBAL_RISK ?? "15 7 * * *",
  energy: process.env.KAIRO_SCHEDULE_ENERGY ?? "45 6 * * *",
} as const;

export const DATA_V2_JOB_NAMES = ["economic", "calendar", "central-bank", "political", "energy", "cftc", "news", "global-risk"] as const;
export type DataV2JobName = typeof DATA_V2_JOB_NAMES[number];

export function monthWindow(now = new Date()) { return { from: new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 1)).toISOString().slice(0, 10), to: new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 3, 0)).toISOString().slice(0, 10) }; }

export function requireSuccessfulPoliticalBackfill<T extends { status: "COMPLETED" | "PARTIAL" | "FAILED" | "SKIPPED" }>(result: T) {
  if (result.status === "FAILED") throw new Error("POLITICAL_BACKFILL_FAILED");
  return result;
}

async function refreshCalendar(from: string, to: string) {
  const official = await Promise.allSettled([ingestFredReleaseCalendar(from, to), ingestCentralBankCalendar(from, to)]);
  const normalized = await getMarketCalendar(from, to, undefined, { force: true }).then((value) => ({ status: "fulfilled" as const, value })).catch((reason) => ({ status: "rejected" as const, reason }));
  if (official.every((item) => item.status === "rejected") && normalized.status === "rejected") {
    const failure = official.find((item): item is PromiseRejectedResult => item.status === "rejected");
    throw failure?.reason ?? normalized.reason;
  }
  return {
    status: official.every((item) => item.status === "fulfilled") && normalized.status === "fulfilled" ? "COMPLETED" as const : "PARTIAL" as const,
    macro: official[0]!.status,
    centralBank: official[1]!.status,
    normalized: normalized.status,
  };
}

export function runDataV2Job(name: DataV2JobName) {
  const window = monthWindow();
  if (name === "economic") return runJob("data-v2-economic", () => ingestFredEconomicData(), { timeoutMs: 240_000, lockSeconds: 300 });
  if (name === "calendar") return runJob("data-v2-calendar", () => refreshCalendar(window.from, window.to), { timeoutMs: 120_000, lockSeconds: 180 });
  if (name === "central-bank") return runJob("data-v2-central-bank", async () => { const result = await ingestCentralBankCalendar(window.from, window.to); await getMarketCalendar(window.from, window.to, undefined, { force: true }); return result; }, { timeoutMs: 120_000, lockSeconds: 180 });
  if (name === "political") return runJob("data-v2-political", () => backfillPoliticalDisclosures({ targetDays: 365, maxPagesPerChamber: 12 }).then(requireSuccessfulPoliticalBackfill), { timeoutMs: 240_000, lockSeconds: 300 });
  if (name === "energy") return runJob("data-v2-energy", () => ingestEiaEnergyData(), { timeoutMs: 180_000, lockSeconds: 300 });
  if (name === "cftc") return runJob("data-v2-cftc", () => ingestCftcPositioning(), { timeoutMs: 180_000, lockSeconds: 300 });
  if (name === "news") return runJob("data-v2-news", () => ingestMarketauxNews(), { timeoutMs: 120_000, lockSeconds: 180 });
  return runJob("data-v2-global-risk", () => getGlobalRiskCurrent({ force: true }), { timeoutMs: 180_000, lockSeconds: 180 });
}

export async function runDataV2CronTick() {
  const [economic, calendar, centralBank, political, energy, cftc, news, globalRisk] = await Promise.all([
    runDataV2Job("economic"), runDataV2Job("calendar"), runDataV2Job("central-bank"), runDataV2Job("political"), runDataV2Job("energy"), runDataV2Job("cftc"), runDataV2Job("news"), runDataV2Job("global-risk"),
  ]);
  return { economic, calendar, centralBank, political, energy, cftc, news, globalRisk };
}
