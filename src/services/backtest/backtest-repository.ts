import "server-only";

import { createHash } from "node:crypto";
import { backtestRuns, backtestTrades, getDatabase, instruments, isDatabaseConfigured } from "@/db";
import { structuredLog } from "@/lib/server/logger";
import type { BacktestResult } from "@/engines/backtest";

export async function persistBacktestResult(userId: string | null, result: BacktestResult) {
  if (!userId || !isDatabaseConfigured()) return null;
  try {
    const database = getDatabase(); const slug = result.configuration.symbol.toLowerCase().replace(/[^a-z0-9]+/g, "-");
    const [instrument] = await database.insert(instruments).values({ canonicalSymbol: result.configuration.symbol, name: result.configuration.symbol, slug, type: result.configuration.symbol.startsWith("^") ? "INDEX" : result.configuration.symbol.endsWith("-USD") ? "CRYPTO" : "EQUITY", active: true }).onConflictDoUpdate({ target: instruments.slug, set: { canonicalSymbol: result.configuration.symbol, active: true, updatedAt: new Date() } }).returning({ id: instruments.id });
    const hash = createHash("sha256").update(JSON.stringify(result.configuration)).digest("hex");
    const [run] = await database.insert(backtestRuns).values({ userId, status: "COMPLETED", configurationHash: hash, configuration: { ...result.configuration }, metrics: { ...result.metrics }, equityCurve: result.equityCurve, modelVersion: result.modelVersion, startedAt: new Date(result.createdAt), completedAt: new Date(), runtimeMs: result.runtimeMs }).returning({ id: backtestRuns.id });
    if (result.trades.length) await database.insert(backtestTrades).values(result.trades.map((trade) => ({ backtestRunId: run.id, instrumentId: instrument.id, side: trade.side, entryAt: new Date(trade.entryAt), exitAt: new Date(trade.exitAt), entryPrice: String(trade.entryPrice), exitPrice: String(trade.exitPrice), quantity: String(trade.quantity), costs: String(trade.costs), pnl: String(trade.pnl), metadata: { returnPercent: trade.returnPercent, holdingDays: trade.holdingDays, exitReason: trade.exitReason } })));
    return run.id;
  } catch (error) { structuredLog("error", "backtest.persistence.failed", { code: error instanceof Error ? error.name : "UNKNOWN" }); return null; }
}
