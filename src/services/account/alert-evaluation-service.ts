import "server-only";

import { eq } from "drizzle-orm";
import { alerts, getDatabase, instruments } from "@/db";
import { financialProviderRouter } from "@/providers";
import { getSignalAnalysis } from "@/services/analysis/signal-service";
import { getTechnicalAnalysis } from "@/services/analysis/technical-service";
import { InternalNotificationChannel } from "@/services/notifications";
import { listPortfolios } from "./portfolio-service";

interface Evaluation { triggered: boolean; observed: number | string | boolean | null; message: string; available: boolean }
const internalChannel = new InternalNotificationChannel();

function thresholdOf(configuration: Record<string, unknown>, fallback = 0) { return typeof configuration.threshold === "number" ? configuration.threshold : fallback; }

export async function evaluateActiveAlerts(limit = 100) {
  const database = getDatabase(); const now = new Date();
  const records = await database.select({ alert: alerts, symbol: instruments.canonicalSymbol }).from(alerts).leftJoin(instruments, eq(alerts.instrumentId, instruments.id)).where(eq(alerts.status, "ACTIVE")).limit(limit);
  let evaluated = 0; let triggered = 0; let unavailable = 0; const errors: Array<{ alertId: string; message: string }> = [];
  for (const record of records) {
    const alert = record.alert;
    if (alert.expiresAt && alert.expiresAt <= now) { await database.update(alerts).set({ status: "EXPIRED", lastEvaluatedAt: now, updatedAt: now }).where(eq(alerts.id, alert.id)); continue; }
    try {
      const configuration = alert.configuration; const threshold = thresholdOf(configuration); let result: Evaluation = { triggered: false, observed: null, message: "Condizione non disponibile", available: false };
      if (["PRICE_ABOVE", "PRICE_BELOW", "PERCENT_CHANGE", "TARGET_REACHED", "STOP_REACHED"].includes(alert.type) && record.symbol) {
        const quote = (await financialProviderRouter.quote(record.symbol)).data; const above = ["PRICE_ABOVE", "TARGET_REACHED"].includes(alert.type); const observed = alert.type === "PERCENT_CHANGE" ? quote.changePercent : quote.price;
        result = { triggered: alert.type === "PERCENT_CHANGE" ? Math.abs(observed) >= Math.abs(threshold) : above ? observed >= threshold : observed <= threshold, observed, available: true, message: `${record.symbol}: ${alert.type.replaceAll("_", " ")} (${observed.toFixed(2)} vs ${threshold.toFixed(2)})` };
      } else if (["VOLUME_ANOMALY", "RSI", "MACD_CROSS", "BREAKOUT", "BREAKDOWN"].includes(alert.type) && record.symbol) {
        const technical = (await getTechnicalAnalysis(record.symbol, "1m", "^GSPC")).analysis;
        if (alert.type === "VOLUME_ANOMALY") result = { triggered: (technical.volume.zScore20 ?? -Infinity) >= (threshold || 2), observed: technical.volume.zScore20, available: technical.volume.zScore20 !== null, message: `${record.symbol}: volume z-score ${technical.volume.zScore20?.toFixed(2) ?? "N/A"}` };
        else if (alert.type === "RSI") result = { triggered: (technical.momentum.rsi14.value ?? -Infinity) >= (threshold || 70), observed: technical.momentum.rsi14.value, available: technical.momentum.rsi14.value !== null, message: `${record.symbol}: RSI ${technical.momentum.rsi14.value?.toFixed(2) ?? "N/A"}` };
        else if (alert.type === "MACD_CROSS") { const previous = typeof configuration.lastMacdHistogram === "number" ? configuration.lastMacdHistogram : null; const current = technical.momentum.macdHistogram; result = { triggered: previous !== null && current !== null && Math.sign(previous) !== Math.sign(current), observed: current, available: current !== null, message: `${record.symbol}: MACD histogram cross` }; }
        else if (alert.type === "BREAKOUT") result = { triggered: technical.structure.breakout, observed: technical.structure.resistance20, available: technical.structure.resistance20 !== null, message: `${record.symbol}: breakout above 20-session resistance` };
        else result = { triggered: technical.structure.breakdown, observed: technical.structure.support20, available: technical.structure.support20 !== null, message: `${record.symbol}: breakdown below 20-session support` };
      } else if (["NEW_SIGNAL", "SIGNAL_CHANGE"].includes(alert.type) && record.symbol) {
        const signal = (await getSignalAnalysis(record.symbol, String(configuration.horizon ?? "1m") as "1m")).analysis.category; const previous = typeof configuration.lastSignal === "string" ? configuration.lastSignal : null;
        result = { triggered: signal !== null && (alert.type === "NEW_SIGNAL" ? !["HOLD"].includes(signal) && previous === null : previous !== null && previous !== signal), observed: signal, available: signal !== null, message: `${record.symbol}: signal ${signal ?? "N/A"}` };
      } else if (["EARNINGS", "DIVIDEND"].includes(alert.type) && record.symbol) {
        const from = now.toISOString().slice(0, 10); const to = new Date(now.getTime() + 7 * 86_400_000).toISOString().slice(0, 10); const events = alert.type === "EARNINGS" ? (await financialProviderRouter.earningsCalendar(from, to, record.symbol)).data : (await financialProviderRouter.dividendCalendar(from, to, record.symbol)).data;
        result = { triggered: events.length > 0, observed: events[0]?.date ?? null, available: true, message: `${record.symbol}: ${alert.type.toLowerCase()} ${events[0]?.date ?? "not scheduled"}` };
      } else if (alert.type === "HIGH_RELEVANCE_NEWS" && record.symbol) {
        const news = (await financialProviderRouter.news(record.symbol, 10)).data; const relevance = Math.max(0, ...news.flatMap((item) => item.tickerSentiment.filter((entry) => entry.symbol === record.symbol).map((entry) => entry.relevance ?? 0)));
        result = { triggered: relevance >= (threshold || .7), observed: relevance, available: news.length > 0, message: `${record.symbol}: high-relevance news (${relevance.toFixed(2)})` };
      } else if (alert.type === "GEOPOLITICAL_EVENT") {
        const news = await financialProviderRouter.topicNews(["geopolitics"], 10).then((value) => value.data).catch(() => []); result = { triggered: news.length > 0, observed: news.length, available: true, message: `${news.length} geopolitical items detected` };
      } else if (alert.type === "PORTFOLIO_RISK") {
        const portfolios = await listPortfolios(alert.userId); const concentration = Math.max(0, ...portfolios.map((portfolio) => portfolio.concentration)); result = { triggered: concentration >= (threshold || 35), observed: concentration, available: portfolios.length > 0, message: `Portfolio concentration ${concentration.toFixed(2)}%` };
      }
      const nextConfiguration = { ...configuration, lastObserved: result.observed, lastOutcome: result.available ? result.triggered ? "TRIGGERED" : "CLEAR" : "UNAVAILABLE", ...(alert.type === "MACD_CROSS" ? { lastMacdHistogram: result.observed } : {}), ...(["NEW_SIGNAL", "SIGNAL_CHANGE"].includes(alert.type) ? { lastSignal: result.observed } : {}) };
      if (result.triggered) {
        const delivered = await internalChannel.deliver({ alertId: alert.id, deduplicationKey: `${alert.type}:${String(result.observed)}:${now.toISOString().slice(0, 10)}`, payload: { message: result.message, observed: result.observed, threshold, evaluatedAt: now.toISOString(), channel: "internal" } });
        if (delivered.delivered) { triggered += 1; await database.update(alerts).set({ status: "TRIGGERED", configuration: nextConfiguration, lastEvaluatedAt: now, triggeredAt: now, updatedAt: now }).where(eq(alerts.id, alert.id)); }
      } else await database.update(alerts).set({ configuration: nextConfiguration, lastEvaluatedAt: now, updatedAt: now }).where(eq(alerts.id, alert.id));
      evaluated += 1; if (!result.available) unavailable += 1;
    } catch (error) { errors.push({ alertId: alert.id, message: error instanceof Error ? error.message : "Evaluation failed" }); }
  }
  return { scanned: records.length, evaluated, triggered, unavailable, errors };
}
