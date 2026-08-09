import "server-only";

import { eq } from "drizzle-orm";
import { alerts, getDatabase, instruments } from "@/db";
import { financialProviderRouter } from "@/providers";
import { getSignalAnalysis } from "@/services/analysis/signal-service";
import { getTechnicalAnalysis } from "@/services/analysis/technical-service";
import { InternalNotificationChannel } from "@/services/notifications";
import { getSymbolPoliticalIntelligence } from "@/services/political";
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
        result = { triggered: false, observed: null, available: false, message: "No verified geopolitical event provider is configured" };
      } else if (["POLITICAL_PURCHASE_DISCLOSURE", "POLITICAL_SALE_DISCLOSURE", "POLITICAL_CLUSTER", "POLITICAL_WATCHLIST_ACTIVITY", "POLITICAL_DIRECTION_CHANGE"].includes(alert.type) && record.symbol) {
        const report = await getSymbolPoliticalIntelligence(record.symbol, { period: "30D", page: 1, pageSize: 100 });
        const previousDisclosure = typeof configuration.lastPoliticalDisclosureDate === "string" ? configuration.lastPoliticalDisclosureDate : null;
        const previousDirection = typeof configuration.lastPoliticalDirection === "string" ? configuration.lastPoliticalDirection : null;
        const side = alert.type === "POLITICAL_PURCHASE_DISCLOSURE" ? "PURCHASE" : alert.type === "POLITICAL_SALE_DISCLOSURE" ? "SALE" : null;
        const matching = report.transactions.find((row) => side === "PURCHASE" ? row.transactionType === "PURCHASE" : side === "SALE" ? row.transactionType.startsWith("SALE") : true);
        const latestDisclosure = matching?.disclosureDate ?? report.summary.lastDisclosureDate;
        const newDisclosure = Boolean(latestDisclosure && previousDisclosure && latestDisclosure > previousDisclosure);
        if (alert.type === "POLITICAL_CLUSTER") {
          const cluster = report.clusters[0]; const observed = cluster?.lastDisclosureDate ?? null;
          result = { triggered: Boolean(cluster && previousDisclosure && cluster.strength !== "NONE" && cluster.lastDisclosureDate > previousDisclosure), observed, available: true, message: `${record.symbol}: cluster disclosure ${cluster ? `${cluster.direction.toLowerCase()} (${cluster.uniquePoliticians} membri)` : "non rilevato"}` };
        } else if (alert.type === "POLITICAL_DIRECTION_CHANGE") {
          result = { triggered: previousDirection !== null && previousDirection !== report.summary.direction, observed: report.summary.direction, available: report.totalTransactions > 0, message: `${record.symbol}: direzione disclosure ${report.summary.direction.replaceAll("_", " ").toLowerCase()}` };
        } else {
          result = { triggered: newDisclosure, observed: latestDisclosure, available: report.totalTransactions > 0, message: `${record.symbol}: ${side ? side.toLowerCase() : "nuova attività"} divulgata il ${latestDisclosure ?? "N/A"}` };
        }
      } else if (alert.type === "PORTFOLIO_RISK") {
        const portfolios = await listPortfolios(alert.userId); const concentration = Math.max(0, ...portfolios.map((portfolio) => portfolio.concentration)); result = { triggered: concentration >= (threshold || 35), observed: concentration, available: portfolios.length > 0, message: `Portfolio concentration ${concentration.toFixed(2)}%` };
      }
      const politicalAlert = alert.type.startsWith("POLITICAL_");
      const nextConfiguration = { ...configuration, lastObserved: result.observed, lastOutcome: result.available ? result.triggered ? "TRIGGERED" : "CLEAR" : "UNAVAILABLE", ...(alert.type === "MACD_CROSS" ? { lastMacdHistogram: result.observed } : {}), ...(["NEW_SIGNAL", "SIGNAL_CHANGE"].includes(alert.type) ? { lastSignal: result.observed } : {}), ...(politicalAlert ? { lastPoliticalDisclosureDate: typeof result.observed === "string" && /^\d{4}-\d{2}-\d{2}$/.test(result.observed) ? result.observed : configuration.lastPoliticalDisclosureDate, lastPoliticalDirection: alert.type === "POLITICAL_DIRECTION_CHANGE" ? result.observed : configuration.lastPoliticalDirection } : {}) };
      if (result.triggered) {
        const delivered = await internalChannel.deliver({ alertId: alert.id, deduplicationKey: `${alert.type}:${String(result.observed)}:${now.toISOString().slice(0, 10)}`, payload: { message: result.message, observed: result.observed, threshold, evaluatedAt: now.toISOString(), channel: "internal" } });
        if (delivered.delivered) { triggered += 1; await database.update(alerts).set({ status: "TRIGGERED", configuration: nextConfiguration, lastEvaluatedAt: now, triggeredAt: now, updatedAt: now }).where(eq(alerts.id, alert.id)); }
      } else await database.update(alerts).set({ configuration: nextConfiguration, lastEvaluatedAt: now, updatedAt: now }).where(eq(alerts.id, alert.id));
      evaluated += 1; if (!result.available) unavailable += 1;
    } catch (error) { errors.push({ alertId: alert.id, message: error instanceof Error ? error.message : "Evaluation failed" }); }
  }
  return { scanned: records.length, evaluated, triggered, unavailable, errors };
}
