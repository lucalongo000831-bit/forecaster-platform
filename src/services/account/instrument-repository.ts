import "server-only";

import { getDatabase, instruments } from "@/db";
import { eq, type InferInsertModel } from "drizzle-orm";
import { AppError } from "@/lib/server/app-error";
import { financialProviderRouter } from "@/providers";
import { normalizeSymbol } from "@/services/yahoo/symbol-resolver";

type InstrumentType = InferInsertModel<typeof instruments>["type"];

function instrumentType(quoteType: string, fallback: InstrumentType): InstrumentType {
  const normalized = quoteType.toUpperCase();
  if (normalized === "ETF") return "ETF";
  if (normalized === "MUTUALFUND" || normalized === "FUND") return "FUND";
  if (normalized === "INDEX") return "INDEX";
  if (normalized === "CRYPTOCURRENCY" || normalized === "CRYPTO") return "CRYPTO";
  if (normalized === "CURRENCY" || normalized === "FOREX") return "FOREX";
  if (normalized === "FUTURE" || normalized === "COMMODITY") return "COMMODITY";
  if (normalized === "EQUITY") return "EQUITY";
  return fallback;
}

export function fallbackInstrumentType(symbol: string): InstrumentType {
  if (symbol.startsWith("^")) return "INDEX";
  if (symbol.endsWith("=X")) return "FOREX";
  if (/^[A-Z0-9]+-USD$/.test(symbol)) return "CRYPTO";
  return "EQUITY";
}

export async function ensureInstrument(input: { symbol: string; name: string; type: InstrumentType; currency?: string | null; market?: string | null }) {
  const database = getDatabase();
  const symbol = normalizeSymbol(input.symbol);
  const slug = symbol.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
  const verified = await financialProviderRouter.quote(symbol).then((result) => result.data).catch(() => null);
  const fallbackType = fallbackInstrumentType(symbol);
  const values = {
    canonicalSymbol: symbol,
    name: verified?.name ?? symbol,
    slug,
    type: verified ? instrumentType(verified.quoteType, fallbackType) : fallbackType,
    currency: verified?.currency ?? null,
    market: verified?.exchange ?? null,
    active: true,
  };
  const query = database.insert(instruments).values(values);
  const [created] = verified
    ? await query.onConflictDoUpdate({ target: instruments.slug, set: { name: values.name, type: values.type, currency: values.currency, market: values.market, active: true, updatedAt: new Date() } }).returning()
    : await query.onConflictDoNothing({ target: instruments.slug }).returning();
  if (created) return created;
  const [existing] = await database.select().from(instruments).where(eq(instruments.slug, slug)).limit(1);
  if (!existing) throw new AppError("INTERNAL_ERROR", "Impossibile registrare lo strumento", 500);
  return existing;
}
