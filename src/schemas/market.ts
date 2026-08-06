import { z } from "zod";

export const symbolSchema = z.string().trim().min(1).max(32).regex(/^(?:\^[A-Za-z0-9][A-Za-z0-9.-]{0,29}|[A-Za-z0-9][A-Za-z0-9.^=-]{0,30})$/);
export const searchQuerySchema = z.string().trim().min(1).max(80).regex(/^[\p{L}\p{N}\s.'’&+^=:_-]+$/u);
export const chartRangeSchema = z.enum(["1D", "5D", "1M", "3M", "6M", "YTD", "1Y", "5Y", "10Y", "MAX"]);
export const chartIntervalSchema = z.enum(["1m", "2m", "5m", "15m", "30m", "60m", "90m", "1h", "1d", "5d", "1wk", "1mo", "3mo"]);

export const searchRequestSchema = z.object({ q: searchQuerySchema });
export const symbolRequestSchema = z.object({ symbol: symbolSchema });
export const chartRequestSchema = z.object({ symbol: symbolSchema, range: chartRangeSchema.default("1Y"), interval: chartIntervalSchema.optional() });
export const statementsRequestSchema = z.object({ symbol: symbolSchema, statement: z.enum(["income", "balance-sheet", "cash-flow"]), period: z.enum(["annual", "quarter"]).default("annual"), limit: z.coerce.number().int().min(1).max(20).default(5) });
export const analystRequestSchema = z.object({ symbol: symbolSchema });
export const marketStatusRequestSchema = z.object({ market: z.string().trim().min(1).max(20).regex(/^[A-Za-z0-9_-]+$/).default("US") });
export const quotesRequestSchema = z.object({
  symbols: z.string().trim().min(1).max(512).transform((value, context) => {
    const symbols = [...new Set(value.split(",").map((symbol) => symbol.trim()).filter(Boolean))];
    if (!symbols.length || symbols.length > 50 || symbols.some((symbol) => !symbolSchema.safeParse(symbol).success)) {
      context.addIssue({ code: "custom", message: "Elenco ticker non valido" });
      return z.NEVER;
    }
    return symbols;
  }),
});
export const resolveRequestSchema = z.object({ symbol: symbolSchema, market: z.string().trim().min(1).max(30).regex(/^[A-Za-z0-9_-]+$/).optional() });
export const earningsRequestSchema = z.object({
  from: z.iso.date(),
  to: z.iso.date(),
  symbol: symbolSchema.optional(),
}).refine((value) => value.from <= value.to, { message: "Intervallo date non valido" });
export const analysisHorizonSchema = z.enum(["intraday", "1d", "1w", "1m", "3m", "6m", "12m", "long"]);
export const technicalRequestSchema = z.object({ symbol: symbolSchema, horizon: analysisHorizonSchema.default("1m"), benchmark: symbolSchema.default("^GSPC") });

export function queryObject(request: Request) {
  return Object.fromEntries(new URL(request.url).searchParams.entries());
}
