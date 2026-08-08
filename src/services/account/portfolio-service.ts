import "server-only";

import { and, asc, count, eq, inArray } from "drizzle-orm";
import { getDatabase, instruments, portfolioPositions, portfolioTransactions, portfolios } from "@/db";
import { calculateLedger } from "@/engines/portfolio";
import { AppError } from "@/lib/server/app-error";
import { financialProviderRouter } from "@/providers";
import type { AccountPortfolio } from "@/types";
import { ensureInstrument } from "./instrument-repository";

async function ownedPortfolio(userId: string, id: string) {
  const [record] = await getDatabase().select().from(portfolios).where(and(eq(portfolios.id, id), eq(portfolios.userId, userId))).limit(1);
  if (!record) throw new AppError("NOT_FOUND", "Portafoglio non trovato", 404);
  return record;
}

export async function listPortfolios(userId: string): Promise<AccountPortfolio[]> {
  const database = getDatabase();
  const records = await database.select().from(portfolios).where(eq(portfolios.userId, userId)).orderBy(asc(portfolios.createdAt));
  if (!records.length) return [];
  const rows = await database.select({ portfolioId: portfolioPositions.portfolioId, instrumentId: portfolioPositions.instrumentId, quantity: portfolioPositions.quantity, averagePrice: portfolioPositions.averagePrice, realizedPnl: portfolioPositions.realizedPnl, symbol: instruments.canonicalSymbol, name: instruments.name, currency: instruments.currency }).from(portfolioPositions).innerJoin(instruments, eq(portfolioPositions.instrumentId, instruments.id)).where(inArray(portfolioPositions.portfolioId, records.map((record) => record.id)));
  const symbols = [...new Set(rows.map((row) => row.symbol))];
  const quoteResult = symbols.length ? await financialProviderRouter.quotes(symbols).catch(() => null) : null;
  const quotes = new Map((quoteResult?.data ?? []).map((quote) => [quote.symbol, quote]));
  return records.map((record) => {
    const matching = rows.filter((row) => row.portfolioId === record.id);
    const raw = matching.map((row) => { const quote = quotes.get(row.symbol); const quantity = Number(row.quantity); const averagePrice = Number(row.averagePrice); const realizedPnl = Number(row.realizedPnl); const currentPrice = quote?.price ?? null; const marketValue = currentPrice === null ? null : currentPrice * quantity; const unrealizedPnl = currentPrice === null ? null : (currentPrice - averagePrice) * quantity; return { instrumentId: row.instrumentId, symbol: row.symbol, name: row.name, quantity, averagePrice, realizedPnl, currentPrice, currency: row.currency, marketValue, unrealizedPnl, allocation: null, lastUpdated: quote?.asOf ?? null, provider: quote ? quoteResult?.meta.provider ?? null : null }; });
    const valued = raw.filter((position) => position.marketValue !== null);
    const gross = valued.reduce((sum, position) => sum + Math.abs(position.marketValue ?? 0), 0);
    const positions = raw.map((position) => ({ ...position, allocation: position.marketValue === null || gross === 0 ? null : Math.abs(position.marketValue) / gross * 100 }));
    const currencies = [...new Set(positions.map((position) => position.currency).filter(Boolean))];
    const warnings: string[] = [];
    if (currencies.some((currency) => currency !== record.baseCurrency)) warnings.push("Valori in valute diverse non convertiti nella valuta base.");
    if (positions.some((position) => position.currentPrice === null)) warnings.push("Alcune quotazioni non sono disponibili; i totali sono parziali.");
    const concentration = positions.reduce((maximum, position) => Math.max(maximum, position.allocation ?? 0), 0);
    if (concentration > 35) warnings.push("Concentrazione elevata: una posizione supera il 35% del valore lordo.");
    return { id: record.id, name: record.name, baseCurrency: record.baseCurrency, positions, totalMarketValue: valued.reduce((sum, position) => sum + (position.marketValue ?? 0), 0), realizedPnl: positions.reduce((sum, position) => sum + position.realizedPnl, 0), unrealizedPnl: positions.reduce((sum, position) => sum + (position.unrealizedPnl ?? 0), 0), concentration, warnings };
  });
}

export async function createPortfolio(userId: string, input: { name: string; baseCurrency: string }) { const database = getDatabase(); const [{ value }] = await database.select({ value: count() }).from(portfolios).where(eq(portfolios.userId, userId)); if (value >= 25) throw new AppError("BAD_REQUEST", "Limite di 25 portafogli raggiunto", 400); const [created] = await database.insert(portfolios).values({ userId, ...input }).returning(); return created; }
export async function updatePortfolio(userId: string, id: string, input: { name?: string; baseCurrency?: string }) { await ownedPortfolio(userId, id); const [updated] = await getDatabase().update(portfolios).set({ ...input, updatedAt: new Date() }).where(and(eq(portfolios.id, id), eq(portfolios.userId, userId))).returning(); return updated; }
export async function deletePortfolio(userId: string, id: string) { await ownedPortfolio(userId, id); await getDatabase().delete(portfolios).where(and(eq(portfolios.id, id), eq(portfolios.userId, userId))); }

async function rebuildPositions(portfolioId: string) {
  const database = getDatabase();
  const transactions = await database.select().from(portfolioTransactions).where(eq(portfolioTransactions.portfolioId, portfolioId)).orderBy(asc(portfolioTransactions.executedAt));
  const ledger = calculateLedger(transactions.map((transaction) => ({ instrumentId: transaction.instrumentId, type: transaction.type, executedAt: transaction.executedAt, quantity: transaction.quantity === null ? null : Number(transaction.quantity), price: transaction.price === null ? null : Number(transaction.price), fees: Number(transaction.fees) })));
  await database.transaction(async (transaction) => {
    await transaction.delete(portfolioPositions).where(eq(portfolioPositions.portfolioId, portfolioId));
    if (ledger.length) await transaction.insert(portfolioPositions).values(ledger.map((position) => ({ portfolioId, instrumentId: position.instrumentId, quantity: String(position.quantity), averagePrice: String(position.averagePrice), realizedPnl: String(position.realizedPnl), calculatedAt: new Date() })));
  });
}

export async function addPortfolioTransaction(userId: string, portfolioId: string, input: { type: "BUY" | "SELL" | "DEPOSIT" | "WITHDRAWAL" | "DIVIDEND" | "FEE" | "SPLIT"; symbol?: string | null; name?: string; instrumentType: "EQUITY" | "ETF" | "FUND" | "INDEX" | "CRYPTO" | "FOREX" | "COMMODITY"; executedAt: string; quantity?: number | null; price?: number | null; fees: number; currency: string; notes?: string | null }) {
  await ownedPortfolio(userId, portfolioId);
  const [{ value }] = await getDatabase().select({ value: count() }).from(portfolioTransactions).where(eq(portfolioTransactions.portfolioId, portfolioId)); if (value >= 5_000) throw new AppError("BAD_REQUEST", "Limite di 5.000 transazioni per portafoglio raggiunto", 400);
  const instrument = input.symbol ? await ensureInstrument({ symbol: input.symbol, name: input.name ?? input.symbol, type: input.instrumentType, currency: input.currency }) : null;
  const [created] = await getDatabase().insert(portfolioTransactions).values({ portfolioId, instrumentId: instrument?.id, type: input.type, executedAt: new Date(input.executedAt), quantity: input.quantity === null || input.quantity === undefined ? null : String(input.quantity), price: input.price === null || input.price === undefined ? null : String(input.price), fees: String(input.fees), currency: input.currency, notes: input.notes }).returning();
  await rebuildPositions(portfolioId);
  return created;
}
