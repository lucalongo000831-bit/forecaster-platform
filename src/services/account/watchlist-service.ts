import "server-only";

import { and, asc, count, eq, gte, inArray } from "drizzle-orm";
import { alerts, calendarEvents, getDatabase, instruments, watchlistItems, watchlists } from "@/db";
import { AppError } from "@/lib/server/app-error";
import { financialProviderRouter } from "@/providers";
import { getSignalAnalysis } from "@/services/analysis/signal-service";
import { getTargetAnalysis } from "@/services/analysis/target-service";
import type { AccountWatchlist } from "@/types";
import { ensureInstrument } from "./instrument-repository";

async function ownedWatchlist(userId: string, id: string) {
  const [record] = await getDatabase().select().from(watchlists).where(and(eq(watchlists.id, id), eq(watchlists.userId, userId))).limit(1);
  if (!record) throw new AppError("NOT_FOUND", "Watchlist non trovata", 404);
  return record;
}

export async function listWatchlists(userId: string): Promise<AccountWatchlist[]> {
  const database = getDatabase();
  const lists = await database.select().from(watchlists).where(eq(watchlists.userId, userId)).orderBy(asc(watchlists.createdAt));
  if (!lists.length) return [];
  const rows = await database.select({ id: watchlistItems.id, watchlistId: watchlistItems.watchlistId, instrumentId: watchlistItems.instrumentId, position: watchlistItems.position, notes: watchlistItems.notes, symbol: instruments.canonicalSymbol, name: instruments.name, type: instruments.type, currency: instruments.currency, market: instruments.market }).from(watchlistItems).innerJoin(instruments, eq(watchlistItems.instrumentId, instruments.id)).where(inArray(watchlistItems.watchlistId, lists.map((list) => list.id))).orderBy(asc(watchlistItems.position));
  const symbols = [...new Set(rows.map((row) => row.symbol))];
  const quoteResult = symbols.length ? await financialProviderRouter.quotes(symbols).catch(() => null) : null;
  const quoteMap = new Map((quoteResult?.data ?? []).map((quote) => [quote.symbol, quote]));
  const [futureEvents, activeAlertRows] = symbols.length ? await Promise.all([
    database.select({ symbol: calendarEvents.symbol, title: calendarEvents.title, startsAt: calendarEvents.startsAt }).from(calendarEvents).where(and(inArray(calendarEvents.symbol, symbols), gte(calendarEvents.startsAt, new Date()))).orderBy(asc(calendarEvents.startsAt)),
    database.select({ instrumentId: alerts.instrumentId }).from(alerts).where(and(eq(alerts.userId, userId), eq(alerts.status, "ACTIVE"), inArray(alerts.instrumentId, rows.map((row) => row.instrumentId)))),
  ]) : [[], []];
  const nextEvent = new Map<string, { title: string; startsAt: string }>();
  for (const event of futureEvents) if (event.symbol && !nextEvent.has(event.symbol)) nextEvent.set(event.symbol, { title: event.title, startsAt: event.startsAt.toISOString() });
  const alertCounts = new Map<string, number>(); for (const alert of activeAlertRows) if (alert.instrumentId) alertCounts.set(alert.instrumentId, (alertCounts.get(alert.instrumentId) ?? 0) + 1);
  const analyses = new Map<string, { signal: string | null; confidence: number | null; target: number | null }>();
  await Promise.all(symbols.slice(0, 8).map(async (symbol) => {
    const [signal, target] = await Promise.all([getSignalAnalysis(symbol, "1m").catch(() => null), getTargetAnalysis(symbol, "12m").catch(() => null)]);
    analyses.set(symbol, { signal: signal?.analysis.category ?? null, confidence: signal?.analysis.confidence ?? null, target: target?.analysis.compositeTarget ?? null });
  }));
  return lists.map((list) => ({ id: list.id, name: list.name, description: list.description, items: rows.filter((row) => row.watchlistId === list.id).map((row) => { const quote = quoteMap.get(row.symbol); const analysis = analyses.get(row.symbol); return { id: row.id, symbol: row.symbol, name: row.name, type: row.type, currency: row.currency, market: row.market, position: row.position, notes: row.notes, price: quote?.price ?? null, changePercent: quote?.changePercent ?? null, volume: quote?.volume ?? null, marketState: quote?.marketState ?? null, lastUpdated: quote?.asOf ?? quoteResult?.meta.sourceTimestamp ?? null, provider: quote ? quoteResult?.meta.provider ?? null : null, signal: analysis?.signal ?? null, confidence: analysis?.confidence ?? null, target: analysis?.target ?? null, nextEvent: nextEvent.get(row.symbol) ?? null, activeAlerts: alertCounts.get(row.instrumentId) ?? 0 }; }) }));
}

export async function createWatchlist(userId: string, input: { name: string; description?: string | null }) {
  const [{ value }] = await getDatabase().select({ value: count() }).from(watchlists).where(eq(watchlists.userId, userId));
  if (value >= 25) throw new AppError("BAD_REQUEST", "Limite di 25 watchlist raggiunto", 400);
  const [created] = await getDatabase().insert(watchlists).values({ userId, name: input.name, description: input.description }).returning();
  return created;
}

export async function updateWatchlist(userId: string, id: string, input: { name?: string; description?: string | null }) {
  await ownedWatchlist(userId, id);
  const [updated] = await getDatabase().update(watchlists).set({ ...input, updatedAt: new Date() }).where(and(eq(watchlists.id, id), eq(watchlists.userId, userId))).returning();
  return updated;
}

export async function deleteWatchlist(userId: string, id: string) { await ownedWatchlist(userId, id); await getDatabase().delete(watchlists).where(and(eq(watchlists.id, id), eq(watchlists.userId, userId))); }

export async function addWatchlistItem(userId: string, watchlistId: string, input: { symbol: string; name: string; type: "EQUITY" | "ETF" | "FUND" | "INDEX" | "CRYPTO" | "FOREX" | "COMMODITY"; currency?: string; market?: string; notes?: string | null; position: number }) {
  await ownedWatchlist(userId, watchlistId); const [{ value }] = await getDatabase().select({ value: count() }).from(watchlistItems).where(eq(watchlistItems.watchlistId, watchlistId)); if (value >= 200) throw new AppError("BAD_REQUEST", "Limite di 200 strumenti per watchlist raggiunto", 400); const instrument = await ensureInstrument(input);
  const [created] = await getDatabase().insert(watchlistItems).values({ watchlistId, instrumentId: instrument.id, notes: input.notes, position: input.position }).onConflictDoUpdate({ target: [watchlistItems.watchlistId, watchlistItems.instrumentId], set: { notes: input.notes, position: input.position, updatedAt: new Date() } }).returning();
  return created;
}

export async function updateWatchlistItem(userId: string, watchlistId: string, itemId: string, input: { notes?: string | null; position?: number }) { await ownedWatchlist(userId, watchlistId); const [updated] = await getDatabase().update(watchlistItems).set({ ...input, updatedAt: new Date() }).where(and(eq(watchlistItems.id, itemId), eq(watchlistItems.watchlistId, watchlistId))).returning(); if (!updated) throw new AppError("NOT_FOUND", "Elemento non trovato", 404); return updated; }
export async function deleteWatchlistItem(userId: string, watchlistId: string, itemId: string) { await ownedWatchlist(userId, watchlistId); const [deleted] = await getDatabase().delete(watchlistItems).where(and(eq(watchlistItems.id, itemId), eq(watchlistItems.watchlistId, watchlistId))).returning({ id: watchlistItems.id }); if (!deleted) throw new AppError("NOT_FOUND", "Elemento non trovato", 404); }
