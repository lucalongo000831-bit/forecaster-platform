import "server-only";

import { and, asc, desc, gte, lte } from "drizzle-orm";
import { getDatabase, globalRiskComponentSnapshots, globalRiskSnapshots, globalRiskTriggers, isDatabaseConfigured } from "@/db";
import type { GlobalRiskHistoryPoint, GlobalRiskHistoryReference, GlobalRiskSnapshot, GlobalRiskStatus, RiskTrend, SystemicStress } from "@/engines/global-risk";
import { structuredLog } from "@/lib/server/logger";

const dayMs = 86_400_000;
const numeric = (value: number | null) => value === null ? null : String(value);

export async function loadGlobalRiskHistoryReference(now = new Date()): Promise<GlobalRiskHistoryReference> {
  if (!isDatabaseConfigured()) return { oneDay: null, fiveDay: null, twentyDay: null, previousScore: null, previousStatus: null, lastStatusChangeAt: null };
  const rows = await getDatabase().select({ score: globalRiskSnapshots.score, status: globalRiskSnapshots.status, calculatedAt: globalRiskSnapshots.calculatedAt }).from(globalRiskSnapshots).where(gte(globalRiskSnapshots.calculatedAt, new Date(now.getTime() - 30 * dayMs))).orderBy(desc(globalRiskSnapshots.calculatedAt));
  const atAge = (days: number) => rows.find((row) => row.calculatedAt.getTime() <= now.getTime() - days * dayMs);
  const latest = rows[0]; const status = latest?.status;
  const lastChange = status ? rows.find((row) => row.status !== status)?.calculatedAt ?? rows.at(-1)?.calculatedAt ?? null : null;
  return { oneDay: atAge(1) ? Number(atAge(1)!.score) : null, fiveDay: atAge(5) ? Number(atAge(5)!.score) : null, twentyDay: atAge(20) ? Number(atAge(20)!.score) : null, previousScore: latest ? Number(latest.score) : null, previousStatus: latest ? latest.status as GlobalRiskStatus : null, lastStatusChangeAt: lastChange?.toISOString() ?? null };
}

export async function loadLatestGlobalRiskSnapshot(): Promise<GlobalRiskSnapshot | null> {
  if (!isDatabaseConfigured()) return null;
  const [row] = await getDatabase().select({ payload: globalRiskSnapshots.payload, id: globalRiskSnapshots.id }).from(globalRiskSnapshots).orderBy(desc(globalRiskSnapshots.calculatedAt)).limit(1);
  return row ? { ...(row.payload as unknown as GlobalRiskSnapshot), id: row.id } : null;
}

export async function loadGlobalRiskHistory(from: Date, to: Date): Promise<GlobalRiskHistoryPoint[]> {
  if (!isDatabaseConfigured()) return [];
  const rows = await getDatabase().select({ id: globalRiskSnapshots.id, score: globalRiskSnapshots.score, status: globalRiskSnapshots.status, systemicStress: globalRiskSnapshots.systemicStress, trend: globalRiskSnapshots.trend, calculatedAt: globalRiskSnapshots.calculatedAt }).from(globalRiskSnapshots).where(and(gte(globalRiskSnapshots.calculatedAt, from), lte(globalRiskSnapshots.calculatedAt, to))).orderBy(asc(globalRiskSnapshots.calculatedAt));
  return rows.map((row, index) => ({ id: row.id, score: Number(row.score), status: row.status as GlobalRiskStatus, systemicStress: row.systemicStress as SystemicStress, trend: row.trend as RiskTrend, calculatedAt: row.calculatedAt.toISOString(), statusChanged: index > 0 && rows[index - 1]!.status !== row.status }));
}

export async function persistGlobalRiskSnapshot(snapshot: GlobalRiskSnapshot, minimumMinutes = 15) {
  if (!isDatabaseConfigured()) return null;
  try {
    const database = getDatabase(); const [latest] = await database.select({ calculatedAt: globalRiskSnapshots.calculatedAt }).from(globalRiskSnapshots).orderBy(desc(globalRiskSnapshots.calculatedAt)).limit(1);
    if (latest && Date.now() - latest.calculatedAt.getTime() < minimumMinutes * 60_000) return null;
    const byKey = new Map(snapshot.components.map((component) => [component.key, component.score]));
    const [created] = await database.insert(globalRiskSnapshots).values({ status: snapshot.status, score: String(snapshot.score), systemicStress: snapshot.systemicStress, trend: snapshot.trend, confidence: snapshot.confidence, dataCompleteness: String(snapshot.dataCompleteness), volatilityScore: numeric(byKey.get("VOLATILITY") ?? null), creditScore: numeric(byKey.get("CREDIT") ?? null), liquidityScore: numeric(byKey.get("LIQUIDITY") ?? null), ratesScore: numeric(byKey.get("RATES") ?? null), breadthScore: numeric(byKey.get("MARKET_BREADTH") ?? null), equityScore: numeric(byKey.get("EQUITY_STRESS") ?? null), crossAssetScore: numeric(byKey.get("CROSS_ASSET") ?? null), macroScore: numeric(byKey.get("MACRO") ?? null), newsRiskScore: numeric(byKey.get("GEOPOLITICS") ?? null), payload: snapshot as unknown as Record<string, unknown>, modelVersion: snapshot.modelVersion, inputTimestamp: new Date(snapshot.inputTimestamp), calculatedAt: new Date(snapshot.calculatedAt) }).returning({ id: globalRiskSnapshots.id });
    if (!created) return null;
    await database.insert(globalRiskComponentSnapshots).values(snapshot.components.map((component) => ({ snapshotId: created.id, component: component.key, score: numeric(component.score), weight: String(component.weight), contribution: String(component.contribution), completeness: String(component.completeness), dataType: component.metrics.some((item) => item.dataType === "PROXY") ? "PROXY" : component.metrics.some((item) => item.dataType === "DIRECT") ? "DIRECT" : "KAIRO_CALCULATED", payload: component as unknown as Record<string, unknown> })));
    await database.insert(globalRiskTriggers).values([...snapshot.escalationTriggers, ...snapshot.deEscalationTriggers].map((trigger) => ({ snapshotId: created.id, triggerKey: trigger.id, direction: trigger.direction, label: trigger.label, threshold: trigger.threshold, active: trigger.active })));
    return created.id;
  } catch (error) { structuredLog("warn", "global-risk.persistence.failed", { code: error instanceof Error ? error.name : "UNKNOWN" }); return null; }
}
