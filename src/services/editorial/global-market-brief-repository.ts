import "server-only";

import { and, desc, eq } from "drizzle-orm";
import { getDatabase, globalMarketBriefs, globalMarketBriefVersions, isDatabaseConfigured } from "@/db";
import { AppError } from "@/lib/server/app-error";
import type { GlobalMarketBrief, GlobalMarketBriefInput } from "@/types";

const BRIEF_SLUG = "global-markets";
const SOURCE_LABEL = "CHATGPT SCHEDULED ANALYSIS — MANUALLY PUBLISHED" as const;

function requireDatabase() { if (!isDatabaseConfigured()) throw new AppError("NOT_CONFIGURED", "Database required for editorial publishing", 503); return getDatabase(); }
type VersionRow = typeof globalMarketBriefVersions.$inferSelect;
function toBrief(row: VersionRow): GlobalMarketBrief {
  const parsed = row.parsedData as unknown as GlobalMarketBriefInput;
  return { ...parsed, id: row.id, briefId: row.briefId, version: row.version, state: row.state as GlobalMarketBrief["state"], title: row.title, reportDate: row.reportDate.toISOString(), status: row.status as GlobalMarketBrief["status"], systemicStress: row.systemicStress as GlobalMarketBrief["systemicStress"], riskTrend: row.riskTrend as GlobalMarketBrief["riskTrend"], rawText: row.rawText, sections: parsed.sections, missingSections: parsed.missingSections ?? [], publishedAt: row.publishedAt?.toISOString() ?? null, publishedBy: row.publishedBy, createdAt: row.createdAt.toISOString(), sourceLabel: SOURCE_LABEL };
}

async function ensureBrief(userId: string) {
  const database = requireDatabase();
  const [existing] = await database.select().from(globalMarketBriefs).where(eq(globalMarketBriefs.slug, BRIEF_SLUG)).limit(1);
  if (existing) return existing;
  const [created] = await database.insert(globalMarketBriefs).values({ slug: BRIEF_SLUG, createdBy: userId }).onConflictDoNothing({ target: globalMarketBriefs.slug }).returning();
  if (created) return created;
  return (await database.select().from(globalMarketBriefs).where(eq(globalMarketBriefs.slug, BRIEF_SLUG)).limit(1))[0]!;
}

export async function getCurrentGlobalMarketBrief() {
  if (!isDatabaseConfigured()) return null;
  const rows = await getDatabase().select({ version: globalMarketBriefVersions }).from(globalMarketBriefVersions).innerJoin(globalMarketBriefs, eq(globalMarketBriefVersions.briefId, globalMarketBriefs.id)).where(and(eq(globalMarketBriefs.slug, BRIEF_SLUG), eq(globalMarketBriefVersions.state, "PUBLISHED"))).orderBy(desc(globalMarketBriefVersions.version)).limit(1);
  return rows[0] ? toBrief(rows[0].version) : null;
}

export async function listGlobalMarketBriefs(includeDrafts = false, limit = 30) {
  if (!isDatabaseConfigured()) return [];
  const rows = await getDatabase().select({ version: globalMarketBriefVersions }).from(globalMarketBriefVersions).innerJoin(globalMarketBriefs, eq(globalMarketBriefVersions.briefId, globalMarketBriefs.id)).where(includeDrafts ? eq(globalMarketBriefs.slug, BRIEF_SLUG) : and(eq(globalMarketBriefs.slug, BRIEF_SLUG), eq(globalMarketBriefVersions.state, "PUBLISHED"))).orderBy(desc(globalMarketBriefVersions.version)).limit(Math.min(100, Math.max(1, limit)));
  return rows.map((row) => toBrief(row.version));
}

export async function createGlobalMarketBriefVersion(input: GlobalMarketBriefInput, userId: string, state: "DRAFT" | "PUBLISHED") {
  const database = requireDatabase(); const brief = await ensureBrief(userId);
  const [latest] = await database.select({ version: globalMarketBriefVersions.version }).from(globalMarketBriefVersions).where(eq(globalMarketBriefVersions.briefId, brief.id)).orderBy(desc(globalMarketBriefVersions.version)).limit(1);
  const version = (latest?.version ?? 0) + 1; const publishedAt = state === "PUBLISHED" ? new Date() : null;
  const [row] = await database.insert(globalMarketBriefVersions).values({ briefId: brief.id, version, state, title: input.title, reportDate: new Date(input.reportDate), status: input.status, systemicStress: input.systemicStress, riskTrend: input.riskTrend, summary: input.sections.summary, rawText: input.rawText, parsedData: input as unknown as Record<string, unknown>, publishedBy: userId, publishedAt }).returning();
  await database.update(globalMarketBriefs).set({ currentVersion: version, state, publishedAt: publishedAt ?? brief.publishedAt, archivedAt: null, updatedAt: new Date() }).where(eq(globalMarketBriefs.id, brief.id));
  return toBrief(row!);
}

export async function archiveGlobalMarketBriefVersion(versionId: string) {
  const database = requireDatabase();
  const [row] = await database.update(globalMarketBriefVersions).set({ state: "ARCHIVED" }).where(eq(globalMarketBriefVersions.id, versionId)).returning();
  if (!row) throw new AppError("NOT_FOUND", "Editorial version not found", 404);
}
