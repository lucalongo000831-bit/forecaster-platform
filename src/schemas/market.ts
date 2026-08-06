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
export const seasonalityWindowSchema = z.enum(["1Y", "5Y", "10Y", "15Y", "20Y", "MAX"]);
export const seasonalityRequestSchema = z.object({ symbol: symbolSchema, window: seasonalityWindowSchema.default("20Y") });
export const signalRequestSchema = z.object({ symbol: symbolSchema, horizon: analysisHorizonSchema.default("1m") });
export const targetHorizonSchema = z.enum(["3m", "6m", "12m", "long"]);
export const targetRequestSchema = z.object({ symbol: symbolSchema, horizon: targetHorizonSchema.default("12m") });
export const riskRequestSchema = z.object({
  symbol: symbolSchema,
  side: z.enum(["LONG", "SHORT"]),
  entryPrice: z.number().positive().max(100_000_000),
  horizon: analysisHorizonSchema,
  riskProfile: z.enum(["CONSERVATIVE", "MODERATE", "AGGRESSIVE", "CUSTOM"]),
  accountSize: z.number().positive().max(10_000_000_000).nullable().optional(),
  maximumRiskPercent: z.number().min(0.1).max(10).nullable().optional(),
  customAtrMultiplier: z.number().min(0.5).max(6).nullable().optional(),
  customStopPercent: z.number().min(0.005).max(0.25).nullable().optional(),
});
export const forecastHorizonSchema = z.enum(["1d", "5d", "10d", "20d", "1m", "3m", "6m", "12m"]);
export const forecastRequestSchema = z.object({ symbol: symbolSchema, horizon: forecastHorizonSchema.default("1m"), target: z.coerce.number().positive().max(100_000_000).optional(), stop: z.coerce.number().positive().max(100_000_000).optional() });

export function queryObject(request: Request) {
  return Object.fromEntries(new URL(request.url).searchParams.entries());
}
