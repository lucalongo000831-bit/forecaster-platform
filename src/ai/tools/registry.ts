import "server-only";

import type { FunctionTool } from "openai/resources/responses/responses";
import { z } from "zod";
import { financialProviderRouter } from "@/providers";
import { financialDataService } from "@/services";
import { executeBacktest } from "@/services/backtest/backtest-service";
import { listWatchlists } from "@/services/account/watchlist-service";
import { getCompanyIntelligence } from "@/services/company";
import { getForecastAnalysis } from "@/services/analysis/forecast-service";
import { getFundamentalAnalysis } from "@/services/analysis/fundamental-service";
import { getSeasonalityAnalysis } from "@/services/analysis/seasonality-service";
import { getSignalAnalysis } from "@/services/analysis/signal-service";
import { getTargetAnalysis } from "@/services/analysis/target-service";
import { getTechnicalAnalysis } from "@/services/analysis/technical-service";
import { getNewsIntelligence } from "@/services/intelligence/news-service";
import { normalizeSymbol } from "@/services/yahoo/symbol-resolver";
import type { ChartRange, InstrumentRef } from "@/types";
import type { KairoPageContext, KairoSource } from "../types";

const symbolSchema = z.string().trim().min(1).max(64).regex(/^[A-Za-z0-9.^=\-]+$/).transform(normalizeSymbol);
const horizonSchema = z.enum(["intraday", "1d", "1w", "1m", "3m", "6m", "12m", "long"]);
const rangeSchema = z.enum(["1D", "5D", "1M", "6M", "YTD", "1Y", "5Y", "MAX"]);

const jsonObject = (properties: Record<string, unknown>, required: string[]): Record<string, unknown> => ({
  type: "object", properties, required, additionalProperties: false,
});
const stringProperty = (description: string) => ({ type: "string", description });
const symbolParameters = jsonObject({ symbol: stringProperty("Ticker normalizzato, per esempio NVDA, ENI.MI, ^GSPC o ETH-USD") }, ["symbol"]);

function tool(name: string, description: string, parameters = symbolParameters): FunctionTool {
  return { type: "function", name, description, parameters, strict: true };
}

export const kairoTools: FunctionTool[] = [
  tool("search_instrument", "Risolve società, ETF, indice, forex o crypto in simboli negoziabili.", jsonObject({ query: stringProperty("Nome o ticker da cercare") }, ["query"])),
  tool("get_quote", "Prezzo, variazione, OHLC, volume e market cap correnti."),
  tool("get_market_status", "Stato corrente del mercato.", jsonObject({ market: stringProperty("Mercato o paese, ad esempio US") }, ["market"])),
  tool("get_chart", "Serie OHLCV storica normalizzata.", jsonObject({ symbol: stringProperty("Ticker"), range: { type: "string", enum: ["1D", "5D", "1M", "6M", "YTD", "1Y", "5Y", "MAX"] } }, ["symbol", "range"])),
  tool("get_company_profile", "Profilo verificato dell'emittente."),
  tool("get_financial_statements", "Bilancio annuale o trimestrale.", jsonObject({ symbol: stringProperty("Ticker societario"), kind: { type: "string", enum: ["income", "balance-sheet", "cash-flow"] }, period: { type: "string", enum: ["annual", "quarter"] } }, ["symbol", "kind", "period"])),
  tool("get_fundamental_analysis", "Metriche fondamentali e qualità finanziaria calcolata."),
  tool("get_technical_analysis", "Trend, momentum, RSI, MACD, volatilità, supporti e resistenze.", jsonObject({ symbol: stringProperty("Ticker"), horizon: { type: "string", enum: ["intraday", "1d", "1w", "1m", "3m", "6m", "12m", "long"] } }, ["symbol", "horizon"])),
  tool("get_seasonality", "Stagionalità calcolata sui prezzi storici.", jsonObject({ symbol: stringProperty("Ticker"), window: { type: "string", enum: ["1Y", "5Y", "10Y", "15Y", "20Y", "MAX"] } }, ["symbol", "window"])),
  tool("get_signals", "Segnale multifattoriale KAIRO.", jsonObject({ symbol: stringProperty("Ticker"), horizon: { type: "string", enum: ["intraday", "1d", "1w", "1m", "3m", "6m", "12m", "long"] } }, ["symbol", "horizon"])),
  tool("get_forecast", "Forecast quantitativo con scenari e confidenza.", jsonObject({ symbol: stringProperty("Ticker"), horizon: { type: "string", enum: ["1d", "5d", "10d", "20d", "1m", "3m", "6m", "12m"] } }, ["symbol", "horizon"])),
  tool("get_targets", "Target analyst, tecnico e composito.", jsonObject({ symbol: stringProperty("Ticker"), horizon: { type: "string", enum: ["3m", "6m", "12m", "long"] } }, ["symbol", "horizon"])),
  tool("get_analyst_estimates", "Consensus e stime disponibili degli analisti."),
  tool("get_analyst_targets", "Target price degli analisti."),
  tool("get_earnings", "Prossimi e recenti earnings verificati.", jsonObject({ symbol: stringProperty("Ticker"), from: stringProperty("Data ISO iniziale"), to: stringProperty("Data ISO finale") }, ["symbol", "from", "to"])),
  tool("get_dividends", "Calendario dividendi verificato.", jsonObject({ symbol: stringProperty("Ticker"), from: stringProperty("Data ISO iniziale"), to: stringProperty("Data ISO finale") }, ["symbol", "from", "to"])),
  tool("get_macro_events", "Eventi macroeconomici in un intervallo.", jsonObject({ from: stringProperty("Data ISO iniziale"), to: stringProperty("Data ISO finale") }, ["from", "to"])),
  tool("get_news", "News originali con link e timestamp."),
  tool("get_news_sentiment", "Sentiment news calcolato da KAIRO."),
  tool("get_political_trades", "Transazioni politiche disponibili; restituisce non disponibile se la fonte non le copre.", jsonObject({ symbol: stringProperty("Ticker"), market: stringProperty("Mercato") }, ["symbol", "market"])),
  tool("get_company_intelligence", "Report societario consolidato downside-first: qualità, valuation, rischi, scenari e fonti."),
  tool("get_crypto_intelligence", "Contesto crypto basato su prezzo, trend, volatilità, forecast, news e rischio; esclude i fondamentali societari."),
  tool("get_risk_register", "Registro rischi societario."),
  tool("get_red_flags", "Red flag societarie con evidenze."),
  tool("get_catalysts", "Catalyst positivi e negativi."),
  tool("get_peer_comparison", "Confronto peer verificato o limite esplicito se assente."),
  tool("get_reverse_dcf", "Reverse DCF e crescita implicita."),
  tool("get_dcf", "Scenari DCF bear/base/bull con ipotesi."),
  tool("get_backtest_summary", "Backtest storico KAIRO sintetico, non una previsione.", jsonObject({ symbol: stringProperty("Ticker"), benchmark: stringProperty("Benchmark, ad esempio ^GSPC"), from: stringProperty("Data ISO iniziale"), to: stringProperty("Data ISO finale") }, ["symbol", "benchmark", "from", "to"])),
  tool("get_user_watchlists", "Watchlist dell'utente corrente per valutare la rilevanza del Daily Market Narrative.", jsonObject({}, [])),
];

export interface KairoToolResult {
  data: unknown;
  sources: KairoSource[];
  resolvedContext?: KairoPageContext;
}

function source(provider: string, symbol: string | null, timestamp: string | null, currency: string | null = null, kind: KairoSource["kind"] = "FACT", url: string | null = null): KairoSource {
  return { provider, label: provider === "calculated" ? "KAIRO calculated" : provider, url, timestamp, symbol, currency, kind };
}

function compact(value: unknown, depth = 0): unknown {
  if (value === null || typeof value !== "object") return value;
  if (depth >= 6) return "[nested data omitted]";
  if (Array.isArray(value)) return value.slice(0, 40).map((item) => compact(item, depth + 1));
  return Object.fromEntries(Object.entries(value as Record<string, unknown>).slice(0, 70).map(([key, item]) => [key, compact(item, depth + 1)]));
}

function reportSlice(report: Awaited<ReturnType<typeof getCompanyIntelligence>>, key: "risks" | "redFlags" | "catalysts" | "peers" | "reverseDcf" | "dcf") {
  if (key === "risks") return report.risks;
  if (key === "redFlags") return report.risks?.redFlags ?? [];
  if (key === "catalysts") return report.risks?.catalysts ?? [];
  if (key === "peers") return report.peers;
  if (key === "reverseDcf") return report.valuation?.reverseDcf ?? null;
  return report.valuation?.scenarios ?? [];
}

function companySources(report: Awaited<ReturnType<typeof getCompanyIntelligence>>): KairoSource[] {
  return report.sources.map((item) => ({ provider: item.provider, label: item.label, url: item.url, timestamp: item.timestamp, symbol: report.symbol, currency: report.currency, kind: item.kind }));
}

export async function executeKairoTool(name: string, rawArguments: unknown, pageContext: KairoPageContext, userId: string): Promise<KairoToolResult> {
  if (name === "get_user_watchlists") {
    const lists = await listWatchlists(userId);
    return { data: compact(lists), sources: [source("KAIRO account data", null, new Date().toISOString())] };
  }
  const pageSymbol = pageContext.symbol;
  if (name === "search_instrument") {
    const { query } = z.object({ query: z.string().trim().min(1).max(120) }).parse(rawArguments);
    const result = await financialProviderRouter.search(query);
    const first = result.data[0];
    const rawType = first?.type?.toLowerCase() ?? "unknown";
    const assetType = rawType.includes("crypto") ? "crypto" : rawType.includes("etf") ? "etf" : rawType.includes("index") ? "index" : rawType.includes("fund") ? "fund" : "equity";
    return { data: compact(result.data), sources: [source(result.meta.provider, null, result.meta.sourceTimestamp)], resolvedContext: first ? { symbol: first.symbol, market: first.venue, assetType } : undefined };
  }
  if (name === "get_market_status") {
    const { market } = z.object({ market: z.string().trim().min(1).max(40) }).parse(rawArguments);
    const result = await financialProviderRouter.marketStatus(market);
    return { data: result.data, sources: [source(result.meta.provider, null, result.meta.sourceTimestamp)] };
  }

  const argumentsWithPage = typeof rawArguments === "object" && rawArguments !== null ? rawArguments as Record<string, unknown> : {};
  const resolvedSymbol = symbolSchema.parse(argumentsWithPage.symbol ?? pageSymbol);
  const parsedSymbol = { symbol: resolvedSymbol };

  if (name === "get_quote") {
    const result = await financialProviderRouter.quote(parsedSymbol.symbol);
    return { data: result.data, sources: [source(result.meta.provider, resolvedSymbol, result.meta.sourceTimestamp, result.data.currency)] };
  }
  if (name === "get_chart") {
    const range = rangeSchema.parse(argumentsWithPage.range);
    const result = await financialProviderRouter.chart(resolvedSymbol, range as ChartRange);
    return { data: compact({ ...result.data, points: result.data.points.slice(-500) }), sources: [source(result.meta.provider, resolvedSymbol, result.meta.sourceTimestamp, result.data.currency)] };
  }
  if (name === "get_company_profile") {
    const result = await financialProviderRouter.profile(resolvedSymbol);
    return { data: result.data, sources: [source(result.meta.provider, resolvedSymbol, result.meta.sourceTimestamp)] };
  }
  if (name === "get_financial_statements") {
    const parsed = z.object({ symbol: symbolSchema, kind: z.enum(["income", "balance-sheet", "cash-flow"]), period: z.enum(["annual", "quarter"]) }).parse({ ...argumentsWithPage, symbol: resolvedSymbol });
    const result = await financialProviderRouter.statements(parsed.symbol, parsed.kind, parsed.period, 10);
    return { data: compact(result.data), sources: [source(result.meta.provider, resolvedSymbol, result.meta.sourceTimestamp)] };
  }
  if (name === "get_fundamental_analysis") {
    const result = await getFundamentalAnalysis(resolvedSymbol);
    return { data: compact(result.analysis), sources: [source(result.provider, resolvedSymbol, result.sourceTimestamp), source("calculated", resolvedSymbol, result.sourceTimestamp, null, "CALCULATED")] };
  }
  if (name === "get_technical_analysis") {
    const horizon = horizonSchema.parse(argumentsWithPage.horizon);
    const result = await getTechnicalAnalysis(resolvedSymbol, horizon);
    return { data: compact(result.analysis), sources: [source(result.provider, resolvedSymbol, result.sourceTimestamp), source("calculated", resolvedSymbol, result.sourceTimestamp, null, "MODEL_OUTPUT")] };
  }
  if (name === "get_seasonality") {
    const window = z.enum(["1Y", "5Y", "10Y", "15Y", "20Y", "MAX"]).parse(argumentsWithPage.window);
    const result = await getSeasonalityAnalysis(resolvedSymbol, window);
    return { data: compact(result), sources: [source(result.provider, resolvedSymbol, result.dataTimestamp), source("calculated", resolvedSymbol, result.dataTimestamp, null, "CALCULATED")] };
  }
  if (name === "get_signals") {
    const result = await getSignalAnalysis(resolvedSymbol, horizonSchema.parse(argumentsWithPage.horizon));
    return { data: compact(result.analysis), sources: result.providers.map((provider) => source(provider, resolvedSymbol, null)).concat(source("calculated", resolvedSymbol, null, null, "MODEL_OUTPUT")) };
  }
  if (name === "get_forecast") {
    const horizon = z.enum(["1d", "5d", "10d", "20d", "1m", "3m", "6m", "12m"]).parse(argumentsWithPage.horizon);
    const result = await getForecastAnalysis(resolvedSymbol, horizon);
    return { data: compact(result.analysis), sources: result.providers.map((provider) => source(provider, resolvedSymbol, null)).concat(source("calculated", resolvedSymbol, null, null, "MODEL_OUTPUT")) };
  }
  if (name === "get_targets") {
    const horizon = z.enum(["3m", "6m", "12m", "long"]).parse(argumentsWithPage.horizon);
    const result = await getTargetAnalysis(resolvedSymbol, horizon);
    return { data: compact(result.analysis), sources: result.providers.map((provider) => source(provider, resolvedSymbol, null)).concat(source("calculated", resolvedSymbol, null, null, "MODEL_OUTPUT")) };
  }
  if (name === "get_analyst_estimates" || name === "get_analyst_targets") {
    const result = await financialProviderRouter.analystConsensus(resolvedSymbol);
    return { data: result.data, sources: [source(result.meta.provider, resolvedSymbol, result.meta.sourceTimestamp, result.data.currency, "ANALYST_CONSENSUS")] };
  }
  if (["get_earnings", "get_dividends"].includes(name)) {
    const dates = z.object({ symbol: symbolSchema, from: z.iso.date(), to: z.iso.date() }).parse({ ...argumentsWithPage, symbol: resolvedSymbol });
    const result = name === "get_earnings" ? await financialProviderRouter.earningsCalendar(dates.from, dates.to, dates.symbol) : await financialProviderRouter.dividendCalendar(dates.from, dates.to, dates.symbol);
    return { data: compact(result.data), sources: [source(result.meta.provider, resolvedSymbol, result.meta.sourceTimestamp)] };
  }
  if (name === "get_macro_events") {
    const dates = z.object({ from: z.iso.date(), to: z.iso.date() }).parse(rawArguments);
    const result = await financialProviderRouter.economicCalendar(dates.from, dates.to);
    return { data: compact(result.data), sources: [source(result.meta.provider, null, result.meta.sourceTimestamp)] };
  }
  if (name === "get_news" || name === "get_news_sentiment") {
    const result = await getNewsIntelligence(resolvedSymbol, 20);
    const newsSources = result.analysis.items.slice(0, 20).map((item) => source(result.meta.provider, resolvedSymbol, item.publishedAt, null, name === "get_news_sentiment" ? "CALCULATED" : "FACT", item.canonicalUrl));
    return { data: compact(result.analysis), sources: newsSources.length ? newsSources : [source(result.meta.provider, resolvedSymbol, result.meta.sourceTimestamp)] };
  }
  if (name === "get_political_trades") {
    const market = z.string().trim().max(80).parse(argumentsWithPage.market ?? pageContext.market ?? "unknown");
    const data = await financialDataService.getPoliticalActivity({ symbol: resolvedSymbol.toLowerCase(), market: market.toLowerCase() } satisfies InstrumentRef);
    return { data: compact(data), sources: [source(data.source ?? "unavailable", resolvedSymbol, null)] };
  }
  if (["get_company_intelligence", "get_risk_register", "get_red_flags", "get_catalysts", "get_peer_comparison", "get_reverse_dcf", "get_dcf"].includes(name)) {
    const report = await getCompanyIntelligence(resolvedSymbol);
    const slice = name === "get_company_intelligence" ? report : reportSlice(report, ({ get_risk_register: "risks", get_red_flags: "redFlags", get_catalysts: "catalysts", get_peer_comparison: "peers", get_reverse_dcf: "reverseDcf", get_dcf: "dcf" } as const)[name as "get_risk_register"]);
    return { data: compact(slice), sources: companySources(report) };
  }
  if (name === "get_crypto_intelligence") {
    const [quote, chart, technical, forecast, seasonality, news] = await Promise.all([
      financialProviderRouter.quote(resolvedSymbol), financialProviderRouter.analyticsChart(resolvedSymbol, "5Y", "1d"), getTechnicalAnalysis(resolvedSymbol, "3m"),
      getForecastAnalysis(resolvedSymbol, "3m").catch(() => null), getSeasonalityAnalysis(resolvedSymbol, "5Y").catch(() => null), getNewsIntelligence(resolvedSymbol, 15).catch(() => null),
    ]);
    const data = { assetClass: "crypto", corporateFundamentalsApplicable: false, quote: quote.data, priceHistory: { range: chart.data.range, points: chart.data.points.slice(-180) }, technical: technical.analysis, forecast: forecast?.analysis ?? null, seasonality, news: news?.analysis ?? null, limitations: ["Bilancio, fatturato, EPS, ROIC e DCF societario non sono applicabili alle crypto."] };
    const sources = [source(quote.meta.provider, resolvedSymbol, quote.meta.sourceTimestamp, quote.data.currency), source(chart.meta.provider, resolvedSymbol, chart.meta.sourceTimestamp, chart.data.currency), source("calculated", resolvedSymbol, chart.meta.sourceTimestamp, chart.data.currency, "MODEL_OUTPUT")];
    if (news) sources.push(...news.analysis.items.slice(0, 10).map((item) => source(news.meta.provider, resolvedSymbol, item.publishedAt, null, "FACT", item.canonicalUrl)));
    return { data: compact(data), sources };
  }
  if (name === "get_backtest_summary") {
    const parsed = z.object({ symbol: symbolSchema, benchmark: symbolSchema, from: z.iso.date(), to: z.iso.date() }).parse({ ...argumentsWithPage, symbol: resolvedSymbol });
    const result = await executeBacktest({ symbol: parsed.symbol, benchmark: parsed.benchmark, from: parsed.from, to: parsed.to, strategy: "TREND_MOMENTUM", direction: "LONG", entryTiming: "NEXT_OPEN", initialCapital: 100_000, stopPercent: 0.08, targetPercent: 0.2, trailingPercent: 0.1, maximumHoldingDays: 120, commission: 1, spreadBps: 2, slippageBps: 3, reinvest: true });
    return { data: compact({ metrics: result.result.metrics, limitations: result.result.limitations, modelVersion: result.result.modelVersion }), sources: result.providers.map((provider) => source(provider, resolvedSymbol, null)).concat(source("calculated", resolvedSymbol, null, null, "MODEL_OUTPUT")) };
  }
  throw new Error(`Tool non supportato: ${name}`);
}
