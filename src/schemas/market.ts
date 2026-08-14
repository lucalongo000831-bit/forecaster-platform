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
export const seasonalityWindowSchema = z.enum(["1Y", "3Y", "5Y", "7Y", "10Y", "15Y", "20Y", "25Y", "MAX"]);
const seasonalityBooleanSchema = z.preprocess((value) => value === "true" ? true : value === "false" ? false : value, z.boolean()).default(true);
const seasonalityDatePartSchema = z.string().regex(/^(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/).refine((value) => new Date(`2024-${value}T00:00:00Z`).toISOString().slice(5, 10) === value, "Data MM-DD non valida");
export const seasonalityRequestSchema = z.object({
  symbol: symbolSchema,
  window: seasonalityWindowSchema.default("20Y"),
  windows: z.string().max(80).optional().transform((value, context) => {
    if (!value) return undefined;
    const parsed = [...new Set(value.split(",").map((item) => item.trim()).filter(Boolean))];
    if (!parsed.length || parsed.length > 9 || parsed.some((item) => !seasonalityWindowSchema.safeParse(item).success)) {
      context.addIssue({ code: "custom", message: "Finestre stagionali non valide" });
      return z.NEVER;
    }
    return parsed as Array<z.infer<typeof seasonalityWindowSchema>>;
  }),
  month: z.coerce.number().int().min(1).max(12).optional(),
  rangeStart: seasonalityDatePartSchema.default("01-01"),
  rangeEnd: seasonalityDatePartSchema.default("12-31"),
  side: z.enum(["LONG", "SHORT"]).default("LONG"),
  includeCycles: seasonalityBooleanSchema,
  includeCorrelations: seasonalityBooleanSchema,
  includeTradeStats: seasonalityBooleanSchema,
  includeTable: seasonalityBooleanSchema,
});
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
export const newsIntelligenceRequestSchema = z.object({ symbol: symbolSchema, limit: z.coerce.number().int().min(1).max(50).default(30) });
export const calendarRequestSchema = z.object({ from: z.iso.date(), to: z.iso.date(), symbol: symbolSchema.optional() }).refine((value) => value.from <= value.to && (new Date(value.to).getTime() - new Date(value.from).getTime()) / 86_400_000 <= 93, { message: "Intervallo calendario non valido o superiore a 93 giorni" });
export const backtestRequestSchema = z.object({
  symbol: symbolSchema,
  benchmark: symbolSchema.default("^GSPC"),
  from: z.iso.date(), to: z.iso.date(),
  strategy: z.enum(["TREND_MOMENTUM", "SMA_CROSS", "BREAKOUT"]),
  direction: z.enum(["LONG", "SHORT", "BOTH"]),
  entryTiming: z.enum(["NEXT_OPEN", "NEXT_CLOSE"]).default("NEXT_OPEN"),
  initialCapital: z.number().min(100).max(100_000_000),
  stopPercent: z.number().min(0.005).max(0.5),
  targetPercent: z.number().min(0.005).max(2),
  trailingPercent: z.number().min(0.005).max(0.5),
  maximumHoldingDays: z.number().int().min(1).max(1_260),
  commission: z.number().min(0).max(10_000),
  spreadBps: z.number().min(0).max(500),
  slippageBps: z.number().min(0).max(500),
  reinvest: z.boolean().default(true),
}).refine((value) => value.from < value.to && (new Date(value.to).getTime() - new Date(value.from).getTime()) / 86_400_000 <= 5_500, { message: "Intervallo backtest non valido o superiore a 15 anni" });

export function queryObject(request: Request) {
  return Object.fromEntries(new URL(request.url).searchParams.entries());
}
