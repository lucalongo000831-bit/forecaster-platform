import "server-only";

import { and, asc, desc, eq } from "drizzle-orm";
import { getDatabase } from "@/db/client";
import { aiConversations, aiMessages, aiToolCalls } from "@/db/schema";
import { AppError } from "@/lib/server/app-error";
import { KAIRO_LIMITS } from "./config";
import type { KairoPageContext, KairoSource } from "./types";

export async function getOrCreateConversation(userId: string, conversationId: string | undefined, message: string, context: KairoPageContext) {
  const database = getDatabase();
  if (conversationId) {
    const [existing] = await database.select().from(aiConversations).where(and(eq(aiConversations.id, conversationId), eq(aiConversations.userId, userId))).limit(1);
    if (!existing) throw new AppError("NOT_FOUND", "Conversazione non trovata", 404);
    return existing;
  }
  const title = message.replace(/\s+/g, " ").trim().slice(0, 80);
  const [created] = await database.insert(aiConversations).values({ userId, title, symbol: context.symbol, market: context.market, assetType: context.assetType }).returning();
  return created;
}

export async function addKairoMessage(conversationId: string, role: "user" | "assistant", content: string, sources: KairoSource[] = [], metadata: Record<string, unknown> = {}) {
  await getDatabase().insert(aiMessages).values({ conversationId, role, content, sources: sources.map((item) => ({ ...item })), metadata });
  await getDatabase().update(aiConversations).set({ updatedAt: new Date() }).where(eq(aiConversations.id, conversationId));
}

export async function addKairoToolCall(conversationId: string, toolName: string, status: "complete" | "failed", metadata: Record<string, unknown>) {
  await getDatabase().insert(aiToolCalls).values({ conversationId, toolName, status, metadata });
}

export async function updateConversationContext(conversationId: string, context: KairoPageContext) {
  await getDatabase().update(aiConversations).set({ symbol: context.symbol, market: context.market, assetType: context.assetType, updatedAt: new Date() }).where(eq(aiConversations.id, conversationId));
}

export async function conversationHistory(conversationId: string) {
  const recent = await getDatabase().select({ role: aiMessages.role, content: aiMessages.content }).from(aiMessages).where(eq(aiMessages.conversationId, conversationId)).orderBy(desc(aiMessages.createdAt)).limit(KAIRO_LIMITS.maxConversationMessages);
  return recent.reverse().flatMap((message) => message.role === "user" || message.role === "assistant" ? [{ role: message.role, content: message.content }] : []);
}

export async function listKairoConversations(userId: string) {
  return getDatabase().select({ id: aiConversations.id, title: aiConversations.title, symbol: aiConversations.symbol, updatedAt: aiConversations.updatedAt }).from(aiConversations).where(eq(aiConversations.userId, userId)).orderBy(desc(aiConversations.updatedAt)).limit(30);
}

export async function loadKairoConversation(userId: string, conversationId: string) {
  const [conversation] = await getDatabase().select().from(aiConversations).where(and(eq(aiConversations.id, conversationId), eq(aiConversations.userId, userId))).limit(1);
  if (!conversation) throw new AppError("NOT_FOUND", "Conversazione non trovata", 404);
  const messages = await getDatabase().select({ id: aiMessages.id, role: aiMessages.role, content: aiMessages.content, sources: aiMessages.sources, createdAt: aiMessages.createdAt }).from(aiMessages).where(eq(aiMessages.conversationId, conversationId)).orderBy(asc(aiMessages.createdAt));
  return { conversation, messages };
}
