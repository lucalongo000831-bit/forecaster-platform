import "server-only";

import { and, desc, eq, inArray } from "drizzle-orm";
import { alertEvents, alerts, getDatabase, instruments } from "@/db";
import { AppError } from "@/lib/server/app-error";
import type { AccountAlert, AccountNotification } from "@/types";
import { ensureInstrument } from "./instrument-repository";

export async function listAlerts(userId: string): Promise<AccountAlert[]> {
  const rows = await getDatabase().select({ id: alerts.id, type: alerts.type, status: alerts.status, configuration: alerts.configuration, lastEvaluatedAt: alerts.lastEvaluatedAt, triggeredAt: alerts.triggeredAt, expiresAt: alerts.expiresAt, createdAt: alerts.createdAt, symbol: instruments.canonicalSymbol }).from(alerts).leftJoin(instruments, eq(alerts.instrumentId, instruments.id)).where(eq(alerts.userId, userId)).orderBy(desc(alerts.createdAt));
  return rows.map((row) => ({ ...row, lastEvaluatedAt: row.lastEvaluatedAt?.toISOString() ?? null, triggeredAt: row.triggeredAt?.toISOString() ?? null, expiresAt: row.expiresAt?.toISOString() ?? null, createdAt: row.createdAt.toISOString() }));
}

export async function createAlert(userId: string, input: { type: string; symbol?: string | null; name?: string; threshold?: number | null; horizon?: string | null; expiresAt?: string | null }) {
  const instrument = input.symbol ? await ensureInstrument({ symbol: input.symbol, name: input.name ?? input.symbol, type: "EQUITY" }) : null;
  const [created] = await getDatabase().insert(alerts).values({ userId, instrumentId: instrument?.id, type: input.type, configuration: { threshold: input.threshold ?? null, horizon: input.horizon ?? null }, expiresAt: input.expiresAt ? new Date(input.expiresAt) : null }).returning();
  return created;
}

async function ownedAlert(userId: string, id: string) { const [record] = await getDatabase().select().from(alerts).where(and(eq(alerts.id, id), eq(alerts.userId, userId))).limit(1); if (!record) throw new AppError("NOT_FOUND", "Alert non trovato", 404); return record; }
export async function updateAlert(userId: string, id: string, input: { status?: "ACTIVE" | "TRIGGERED" | "PAUSED" | "EXPIRED" | "DISABLED"; threshold?: number | null; expiresAt?: string | null }) { const record = await ownedAlert(userId, id); const configuration = input.threshold === undefined ? record.configuration : { ...record.configuration, threshold: input.threshold }; const [updated] = await getDatabase().update(alerts).set({ status: input.status, configuration, expiresAt: input.expiresAt === undefined ? record.expiresAt : input.expiresAt ? new Date(input.expiresAt) : null, updatedAt: new Date() }).where(and(eq(alerts.id, id), eq(alerts.userId, userId))).returning(); return updated; }
export async function deleteAlert(userId: string, id: string) { await ownedAlert(userId, id); await getDatabase().delete(alerts).where(and(eq(alerts.id, id), eq(alerts.userId, userId))); }

export async function listNotifications(userId: string): Promise<AccountNotification[]> {
  const owned = await getDatabase().select({ id: alerts.id, type: alerts.type, symbol: instruments.canonicalSymbol }).from(alerts).leftJoin(instruments, eq(alerts.instrumentId, instruments.id)).where(eq(alerts.userId, userId));
  if (!owned.length) return [];
  const byId = new Map(owned.map((item) => [item.id, item]));
  const events = await getDatabase().select().from(alertEvents).where(inArray(alertEvents.alertId, owned.map((item) => item.id))).orderBy(desc(alertEvents.createdAt)).limit(100);
  return events.map((event) => ({ id: event.id, alertId: event.alertId, type: byId.get(event.alertId)?.type ?? "UNKNOWN", symbol: byId.get(event.alertId)?.symbol ?? null, payload: event.payload, deliveredAt: event.deliveredAt?.toISOString() ?? null, createdAt: event.createdAt.toISOString() }));
}
