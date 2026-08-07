import "server-only";

import { lt } from "drizzle-orm";
import { alertEvents, calculationRuns, getDatabase, isDatabaseConfigured, providerRequestLogs, sessions } from "@/db";
import { financialProviderRouter } from "@/providers";
import { evaluateActiveAlerts } from "@/services/account";
import { getMarketCalendar } from "@/services/calendar/calendar-service";
import { runJob } from "./job-runner";

const LIQUID_SYMBOLS = ["AAPL", "MSFT", "NVDA", "TSLA", "AMZN", "META", "^GSPC", "^IXIC", "BTC-USD", "ETH-USD", "ENI.MI", "STLAM.MI"];
const day = (offset: number) => new Date(Date.now() + offset * 86_400_000).toISOString().slice(0, 10);

export function runMarketRefreshJob() {
  return runJob("market-refresh", async () => {
    const results = await Promise.allSettled([
      financialProviderRouter.quotes(LIQUID_SYMBOLS),
      ...LIQUID_SYMBOLS.slice(0, 6).map((symbol) => financialProviderRouter.analyticsChart(symbol, "5Y", "1d")),
      ...LIQUID_SYMBOLS.slice(0, 4).map((symbol) => financialProviderRouter.fundamentals(symbol)),
      ...LIQUID_SYMBOLS.slice(0, 4).map((symbol) => financialProviderRouter.news(symbol, 20)),
      getMarketCalendar(day(-1), day(30)),
    ]);
    return { attempted: results.length, fulfilled: results.filter((result) => result.status === "fulfilled").length, rejected: results.filter((result) => result.status === "rejected").length };
  }, { timeoutMs: 52_000, lockSeconds: 60 });
}

export function runAlertEvaluationJob() {
  return runJob("alert-evaluation", async () => isDatabaseConfigured() ? evaluateActiveAlerts(100) : { skipped: true, reason: "database-not-configured" }, { timeoutMs: 45_000, lockSeconds: 60 });
}

export function runCleanupJob() {
  return runJob("retention-cleanup", async () => {
    if (!isDatabaseConfigured()) return { skipped: true, reason: "database-not-configured" };
    const database = getDatabase(); const now = new Date(); const monthAgo = new Date(Date.now() - 30 * 86_400_000); const sixMonthsAgo = new Date(Date.now() - 180 * 86_400_000);
    const [expiredSessions, oldRuns, oldLogs, oldEvents] = await Promise.all([
      database.delete(sessions).where(lt(sessions.expiresAt, now)).returning({ id: sessions.id }),
      database.delete(calculationRuns).where(lt(calculationRuns.startedAt, monthAgo)).returning({ id: calculationRuns.id }),
      database.delete(providerRequestLogs).where(lt(providerRequestLogs.createdAt, monthAgo)).returning({ id: providerRequestLogs.id }),
      database.delete(alertEvents).where(lt(alertEvents.createdAt, sixMonthsAgo)).returning({ id: alertEvents.id }),
    ]);
    return { expiredSessions: expiredSessions.length, oldRuns: oldRuns.length, oldLogs: oldLogs.length, oldEvents: oldEvents.length };
  }, { timeoutMs: 20_000, lockSeconds: 60 });
}

export async function runDailyJobs() {
  const [market, alerts, cleanup] = await Promise.all([runMarketRefreshJob(), runAlertEvaluationJob(), runCleanupJob()]);
  return { market, alerts, cleanup };
}
