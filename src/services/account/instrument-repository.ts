import "server-only";

import { getDatabase, instruments } from "@/db";
import type { InferInsertModel } from "drizzle-orm";

export async function ensureInstrument(input: { symbol: string; name: string; type: InferInsertModel<typeof instruments>["type"]; currency?: string | null; market?: string | null }) {
  const database = getDatabase(); const slug = input.symbol.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
  const [instrument] = await database.insert(instruments).values({ canonicalSymbol: input.symbol, name: input.name, slug, type: input.type, currency: input.currency, market: input.market, active: true }).onConflictDoUpdate({ target: instruments.slug, set: { name: input.name, type: input.type, currency: input.currency, market: input.market, active: true, updatedAt: new Date() } }).returning();
  return instrument;
}
