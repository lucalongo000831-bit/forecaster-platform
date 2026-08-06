import "server-only";

import type { FinancialDataProvider } from "./financial-data-provider";
import { MockFinancialDataProvider } from "./mock-financial-data-provider";
import { financialProviderRouter } from "@/providers";
import { analyticalClose, annualPerformance, drawdowns, periodReturns, relativeStrengthIndex, simpleMovingAverage, toTimeSeries } from "./yahoo/analytics";
import { instrumentHref, marketSlug, normalizeSymbol } from "./yahoo/symbol-resolver";
import { canFallback, safeServerLog } from "./yahoo/errors";
import { analyzeTechnical } from "@/engines/technical";
import { analyzeFundamentals, statementValue } from "@/engines/fundamental";
import type {
  DashboardData,
  FundamentalsData,
  NewsData,
  OverviewData,
  PoliticalData,
  FinancialPoint,
  InstrumentProfile,
  InstrumentRef,
  MarketChartDto,
  MomentumData,
  PatternCase,
  PatternData,
  SearchInstrument,
  SeasonalityData,
  ShellData,
  Signal,
  SummaryMetric,
  WatchlistEntry,
} from "@/types";

const DEFAULT_SYMBOL = "NVDA";
const DEFAULT_REF: InstrumentRef = { market: "nasdaq", symbol: DEFAULT_SYMBOL };
const WATCHLIST_SYMBOLS = ["AAPL", "MSFT", "NVDA", "TSLA"];
const DISCOVERY_SYMBOLS = ["AAPL", "MSFT", "NVDA", "TSLA", "^GSPC", "BTC-USD", "ENI.MI", "STLAM.MI"];

function refSymbol(ref: InstrumentRef) { return normalizeSymbol(decodeURIComponent(ref.symbol)); }
function signal(change: number): Signal { return change >= 0.75 ? "BUY" : change <= -0.75 ? "SELL" : "HOLD"; }
function compact(value: number | null, currency?: string) {
  if (value === null) return "Dato non disponibile";
  const formatted = new Intl.NumberFormat("en-US", { notation: "compact", maximumFractionDigits: 2 }).format(value);
  return currency ? `${formatted} ${currency}` : formatted;
}
function numberText(value: number | null, suffix = "") { return value === null ? "Dato non disponibile" : `${value.toFixed(2)}${suffix}`; }
function quoteType(type: string): SearchInstrument["type"] {
  if (type === "ETF" || type === "MUTUALFUND") return "ETF";
  if (type === "INDEX") return "Index";
  if (type === "CURRENCY") return "Forex";
  if (type === "CRYPTOCURRENCY") return "Crypto";
  return "Stock";
}

export class YahooFinanceProvider implements FinancialDataProvider {
  private readonly mock = new MockFinancialDataProvider();

  private async fallback<T>(operation: string, symbol: string | undefined, real: () => Promise<T>, demo: () => Promise<T>): Promise<T> {
    try { return await real(); }
    catch (error) {
      if (!canFallback(error)) throw error;
      safeServerLog(`${operation}:fallback`, symbol, error);
      return demo();
    }
  }

  getBrand() { return this.mock.getBrand(); }

  async getShellData() {
    const brand = await this.getBrand();
    return this.fallback<ShellData>("shell", undefined, async () => {
      const quotesResult = await financialProviderRouter.quotes(DISCOVERY_SYMBOLS);
      const quotes = quotesResult.data;
      const primary = quotes.find((item) => item.symbol === DEFAULT_SYMBOL) ?? (await financialProviderRouter.quote(DEFAULT_SYMBOL)).data;
      return {
        brand,
        primaryInstrument: DEFAULT_REF,
        searchResults: quotes.map((item) => ({ name: item.name, meta: `${item.symbol} · ${item.exchange}`, href: instrumentHref(item.symbol, item.exchange, item.quoteType) })),
        marketStatus: primary.marketState === "REGULAR" ? "US market open" : "US market closed",
        marketClosesIn: primary.isDelayed ? "Quotations may be delayed" : `Updated ${primary.asOf ? new Date(primary.asOf).toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" }) : "recently"}`,
        source: quotesResult.meta.provider,
      };
    }, async () => ({ ...(await this.mock.getShellData()), source: "mock" as const, marketStatus: "Demo mode", marketClosesIn: "Financial providers unavailable" }));
  }

  async getWatchlist(): Promise<WatchlistEntry[]> {
    return this.fallback<WatchlistEntry[]>("watchlist", undefined, async () => {
      const quotes = (await financialProviderRouter.quotes(WATCHLIST_SYMBOLS)).data;
      return quotes.map((quote) => ({
        symbol: quote.symbol,
        name: quote.name,
        price: quote.price,
        changePercent: quote.changePercent,
        signal: signal(quote.changePercent),
        currency: quote.currency,
        market: marketSlug(quote.exchange, quote.quoteType),
        source: quote.source,
      }));
    }, async () => (await this.mock.getWatchlist()).map((item) => ({ ...item, source: "mock" as const })));
  }

  async getSearchUniverse(): Promise<SearchInstrument[]> {
    return this.fallback<SearchInstrument[]>("discovery", undefined, async () => {
      const quotes = (await financialProviderRouter.quotes(DISCOVERY_SYMBOLS)).data;
      return quotes.map((quote) => ({
        symbol: quote.symbol,
        name: quote.name,
        type: quoteType(quote.quoteType),
        venue: quote.exchange,
        price: quote.price,
        currency: quote.currency,
        href: instrumentHref(quote.symbol, quote.exchange, quote.quoteType),
        source: quote.source,
      }));
    }, async () => (await this.mock.getSearchUniverse()).map((item) => ({ ...item, source: "mock" as const })));
  }

  async getInstrument(ref: InstrumentRef): Promise<InstrumentProfile> {
    const symbol = refSymbol(ref);
    return this.fallback<InstrumentProfile>("instrument", symbol, async () => {
      const quoteResult = await financialProviderRouter.quote(symbol);
      const quote = quoteResult.data;
      const profile = await financialProviderRouter.profile(symbol).then((result) => result.data).catch((error) => {
        safeServerLog("profile:partial", symbol, error);
        return null;
      });
      return {
        market: marketSlug(quote.exchange, quote.quoteType),
        symbol,
        name: profile?.name ?? quote.name,
        currency: quote.currency,
        country: profile?.country ?? "Dato non disponibile",
        category: quoteType(quote.quoteType),
        sector: profile?.sector ?? profile?.industry ?? "Dato non disponibile",
        classifications: [quoteType(quote.quoteType), quote.exchange, profile?.industry].filter((item): item is string => Boolean(item)),
        quote: {
          price: quote.price,
          change: quote.change,
          changePercent: quote.changePercent,
          dayLow: quote.dayLow ?? quote.price,
          dayHigh: quote.dayHigh ?? quote.price,
          volume: quote.volume ?? 0,
          currency: quote.currency,
          marketStatus: quote.marketState === "REGULAR" ? "Market open" : "Market closed",
          open: quote.open ?? undefined,
          previousClose: quote.previousClose ?? undefined,
          marketCap: quote.marketCap ?? undefined,
          asOf: quote.asOf ?? undefined,
          isDelayed: quote.isDelayed,
          source: quote.source,
        },
        earnings: { daysUntil: 0, dateLabel: "Dato non disponibile", consensusEps: 0 },
        description: profile?.description ?? undefined,
        exchange: quote.exchange,
        quoteType: quote.quoteType,
        source: quoteResult.meta.provider,
      };
    }, async () => {
      const demo = await this.mock.getInstrument(ref);
      return { ...demo, market: ref.market, symbol, name: `${symbol} · modalità demo`, source: "mock", quote: { ...demo.quote, source: "mock", isDelayed: true, marketStatus: "Demo data" }, earnings: { daysUntil: 0, dateLabel: "Dato non disponibile", consensusEps: 0 } };
    });
  }

  private async longChart(symbol: string): Promise<MarketChartDto> { return (await financialProviderRouter.chart(symbol, "MAX")).data; }

  async getOverview(ref: InstrumentRef) {
    const symbol = refSymbol(ref);
    return this.fallback<OverviewData>("overview", symbol, async () => {
      const chart = await this.longChart(symbol);
      return {
        priceSeries: toTimeSeries(chart.points),
        drawdownSeries: drawdowns(chart.points),
        annualPerformance: annualPerformance(chart.points),
        dividendSeries: [],
        returns: periodReturns(chart.points),
        insiderTransactions: [],
        insiderTotalActivity: 0,
        source: "calculated" as const,
        unavailableSections: ["Dividends history", "Insider transactions"],
      };
    }, async () => ({ ...(await this.mock.getOverview(ref)), source: "mock" as const }));
  }

  async getSeasonality(ref: InstrumentRef): Promise<SeasonalityData> {
    const symbol = refSymbol(ref);
    return this.fallback<SeasonalityData>("seasonality", symbol, async () => {
      const points = (await this.longChart(symbol)).points;
      const monthly = Array.from({ length: 12 }, () => [] as number[]);
      const annual = new Map<string, { first: number; last: number }>();
      for (let index = 1; index < points.length; index += 1) {
        const month = new Date(points[index].timestamp).getUTCMonth();
        monthly[month].push(((analyticalClose(points[index]) / analyticalClose(points[index - 1])) - 1) * 100);
        const year = points[index].timestamp.slice(0, 4);
        const existing = annual.get(year);
        const close = analyticalClose(points[index]);
        if (existing) existing.last = close; else annual.set(year, { first: close, last: close });
      }
      const averages = monthly.map((values) => values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : 0);
      const bestIndex = averages.indexOf(Math.max(...averages));
      const annualReturns = [...annual.values()].map(({ first, last }) => ((last / first) - 1) * 100);
      const averageReturn = annualReturns.length ? annualReturns.reduce((sum, value) => sum + value, 0) / annualReturns.length : 0;
      return {
        series: averages.map((average, index) => ({ week: index + 1, current: average, average, analogue: average })),
        bestMonth: new Intl.DateTimeFormat("en-US", { month: "long", timeZone: "UTC" }).format(new Date(Date.UTC(2020, bestIndex, 1))),
        positiveYearsPercent: annualReturns.length ? annualReturns.filter((value) => value > 0).length / annualReturns.length * 100 : 0,
        averageReturn,
        bias: averageReturn > 1 ? "Bullish" : averageReturn < -1 ? "Bearish" : "Neutral",
        source: "calculated",
      };
    }, async () => ({ ...(await this.mock.getSeasonality(ref)), source: "mock" as const }));
  }

  async getPatterns(ref: InstrumentRef): Promise<PatternData> {
    const symbol = refSymbol(ref);
    return this.fallback<PatternData>("patterns", symbol, async () => {
      const points = (await financialProviderRouter.chart(symbol, "5Y")).data.points;
      const window = 21;
      const cases: PatternCase[] = [];
      for (let index = window; index < points.length; index += window) {
        const segment = points.slice(index - window, index + 1);
        const start = segment[0]; const end = segment.at(-1)!;
        const startClose = analyticalClose(start);
        const returns = segment.map((point) => ((analyticalClose(point) / startClose) - 1) * 100);
        const performance = returns.at(-1) ?? 0;
        cases.push({ id: cases.length + 1, direction: performance >= 0 ? "bullish" : "bearish", start: start.timestamp.slice(0, 10), end: end.timestamp.slice(0, 10), performance, drop: Math.min(...returns), rise: Math.max(...returns) });
      }
      const recent = points.slice(-90);
      const usable = cases.slice(-24);
      const bullish = usable.filter((item) => item.direction === "bullish").length;
      const bullishProbability = usable.length ? Math.round(bullish / usable.length * 100) : 50;
      const mostCorrelated = usable.at(-1);
      return {
        series: toTimeSeries(recent),
        probability: { bullish: bullishProbability, bearish: 100 - bullishProbability },
        robustness: Math.min(5, Math.max(1, Math.round(usable.length / 5))),
        strength: Math.abs(bullishProbability - 50) >= 20 ? "Strong" : "Moderate",
        assessment: "Historical rolling-window statistic calculated from Yahoo price history; it is not a forecast.",
        correlatedEvent: mostCorrelated ? { trade: mostCorrelated.direction === "bullish" ? "Bullish" : "Bearish", date: mostCorrelated.start, performance: mostCorrelated.performance, maxDrop: mostCorrelated.drop } : { trade: "Dato non disponibile", date: "—", performance: 0, maxDrop: 0 },
        cases: usable,
        source: "calculated",
      };
    }, async () => { const data = await this.mock.getPatterns(ref); return { ...data, assessment: `DEMO FALLBACK · ${data.assessment}`, source: "mock" as const }; });
  }

  async getMomentum(ref: InstrumentRef): Promise<MomentumData> {
    const symbol = refSymbol(ref);
    return this.fallback<MomentumData>("momentum", symbol, async () => {
      const points = (await financialProviderRouter.chart(symbol, "5Y", "1d")).data.points;
      const values = points.map(analyticalClose);
      const analysis = analyzeTechnical(symbol, points);
      const rsi = relativeStrengthIndex(values);
      const sma20 = simpleMovingAverage(values, 20);
      const sma50 = simpleMovingAverage(values, 50);
      const latest = values.at(-1) ?? 0;
      const latestRsi = analysis.momentum.rsi14.value ?? 50;
      const distance20 = sma20.at(-1) ? (latest / sma20.at(-1)! - 1) * 100 : 0;
      const mood = latestRsi >= 70 ? "Overbought" : latestRsi <= 30 ? "Oversold" : "Neutral";
      return {
        mood,
        assessment: `Technical score ${analysis.score.toFixed(1)}/100 · ${analysis.modelVersion} · ${analysis.observations} observations.`,
        metrics: [{ label: "RSI (14)", value: latestRsi }, { label: "vs SMA 20", value: distance20 }, { label: "ATR (14)", value: analysis.volatility.atr14.value ?? 0 }],
        dpoSeries: points.map((point, index) => ({ label: point.timestamp.slice(0, 10), value: analyticalClose(point) - sma20[index], comparison: analyticalClose(point) - sma50[index] })),
        oscillatorSeries: points.map((point, index) => ({ label: point.timestamp.slice(0, 10), value: (rsi[index] - 50) * 2 })),
        source: "calculated",
      };
    }, async () => { const data = await this.mock.getMomentum(ref); return { ...data, assessment: `DEMO FALLBACK · ${data.assessment}`, source: "mock" as const }; });
  }

  async getFundamentals(ref: InstrumentRef): Promise<FundamentalsData> {
    const symbol = refSymbol(ref);
    return this.fallback<FundamentalsData>("fundamentals", symbol, async () => {
      const [fundamentalsResult, quoteResult, incomeResult, balanceResult, cashFlowResult, ratiosResult, analystResult] = await Promise.all([
        financialProviderRouter.fundamentals(symbol),
        financialProviderRouter.quote(symbol),
        financialProviderRouter.statements(symbol, "income", "annual", 6).catch(() => null),
        financialProviderRouter.statements(symbol, "balance-sheet", "annual", 6).catch(() => null),
        financialProviderRouter.statements(symbol, "cash-flow", "annual", 6).catch(() => null),
        financialProviderRouter.ratios(symbol, "annual", 6).catch(() => null),
        financialProviderRouter.analystConsensus(symbol).catch(() => null),
      ]);
      const fundamentals = fundamentalsResult.data;
      const quote = quoteResult.data;
      const analysis = analyzeFundamentals({ symbol, summary: fundamentals, income: incomeResult?.data, balanceSheet: balanceResult?.data, cashFlow: cashFlowResult?.data, ratios: ratiosResult?.data, analyst: analystResult?.data, source: fundamentalsResult.meta.provider });
      const summaryColumns: SummaryMetric[][] = [[
        { label: "Annual Dividend", value: fundamentals.dividendRate === null ? "Dato non disponibile" : `${fundamentals.dividendRate.toFixed(2)} ${quote.currency}` },
        { label: "Dividend Yield", value: numberText(fundamentals.dividendYield === null ? null : fundamentals.dividendYield * 100, "%") },
        { label: "Enterprise Value", value: compact(fundamentals.enterpriseValue, quote.currency) },
      ], [
        { label: "Market cap", value: compact(fundamentals.marketCap, quote.currency) },
        { label: "EPS (TTM)", value: numberText(fundamentals.trailingEps) },
        { label: "P/E (TTM)", value: numberText(fundamentals.trailingPe) },
        { label: "Last Price", value: `${quote.price.toFixed(2)} ${quote.currency}` },
      ]];
      const revenueB = fundamentals.revenue === null ? null : fundamentals.revenue / 1e9;
      const cashFlowB = fundamentals.freeCashflow === null ? null : fundamentals.freeCashflow / 1e9;
      const incomeStatements = analysis.inputs.income;
      const cashStatements = analysis.inputs.cashFlow;
      const financials: FinancialPoint[] = [...incomeStatements].reverse().map((statement) => {
        const revenue = statementValue(statement, ["revenue", "totalRevenue"]);
        const income = statementValue(statement, ["netIncome", "netIncomeCommonStockholders"]);
        const matchingCash = cashStatements.find((item) => item.fiscalDate === statement.fiscalDate);
        const cashFlow = statementValue(matchingCash, ["freeCashFlow"]);
        return { year: statement.fiscalDate.slice(0, 4), sales: revenue === null ? null : revenue / 1e9, income: income === null ? null : income / 1e9, cashFlow: cashFlow === null ? null : cashFlow / 1e9, roe: null, debt: null, margin: revenue && income !== null ? income / revenue * 100 : null };
      });
      if (!financials.length && (revenueB !== null || cashFlowB !== null)) financials.push({ year: "TTM", sales: revenueB, income: null, cashFlow: cashFlowB, roe: fundamentals.returnOnEquity === null ? null : fundamentals.returnOnEquity * 100, debt: fundamentals.debtToEquity, margin: fundamentals.profitMargins === null ? null : fundamentals.profitMargins * 100 });
      const providerLabel = fundamentalsResult.meta.provider === "fmp" ? "FMP" : "Yahoo Finance";
      const statementDefinitions = [
        ["Revenue", ["revenue", "totalRevenue"]], ["Cost of revenue", ["costOfRevenue"]], ["Gross profit", ["grossProfit"]], ["Operating income", ["operatingIncome"]], ["Net income", ["netIncome", "netIncomeCommonStockholders"]], ["EPS diluted", ["epsDiluted", "eps"]],
      ] as const;
      const statementRows = statementDefinitions.map(([label, fields]) => ({ label, values: incomeStatements.map((statement) => { const value = statementValue(statement, fields); return value === null ? null : label.includes("EPS") ? value : value / 1e9; }) })).filter((row) => row.values.some((value) => value !== null));
      const ratioMetrics = [
        { label: "Revenue growth YoY", value: analysis.metrics.revenueGrowthYoY, percent: true },
        { label: "Net margin", value: analysis.metrics.netMargin, percent: true },
        { label: "Return on equity", value: analysis.metrics.returnOnEquity, percent: true },
        { label: "Debt / equity", value: analysis.metrics.debtToEquity, percent: false },
        { label: "Free cash flow margin", value: analysis.metrics.freeCashFlowMargin, percent: true },
        { label: "P/E", value: analysis.metrics.trailingPe, percent: false },
      ].filter((metric) => metric.value !== null);
      return {
        summaryColumns,
        financials,
        fairValues: [], averageFairValue: 0, fairValueUpsidePercent: 0,
        scoreSeries: analysis.confidence === "INSUFFICIENT" ? [] : [
          ["Growth", analysis.growthScore], ["Profitability", analysis.profitabilityScore], ["Balance sheet", analysis.balanceSheetScore], ["Cash flow", analysis.cashFlowScore], ["Valuation", analysis.valuationScore], ["Quality", analysis.qualityScore],
        ].flatMap(([label, value]) => typeof value === "number" ? [{ label: String(label), value }] : []), solidityScore: analysis.fundamentalScore ?? 0,
        sharesSeries: fundamentals.sharesOutstanding === null ? [] : [{ label: "TTM", value: fundamentals.sharesOutstanding / 1e9 }],
        valueSignals: analysis.confidence === "INSUFFICIENT" ? [] : [{ label: "Data completeness", value: `${analysis.dataCompleteness.toFixed(0)}%` }, { label: "Confidence", value: analysis.confidence }, ...analysis.reasons.slice(0, 1).map((reason) => ({ label: "Latest observation", value: reason }))], products: [], revenueByYear: [],
        ratios: ratioMetrics.map((metric) => ({ label: metric.label, value: metric.percent ? numberText((metric.value as number) * 100, "%") : numberText(metric.value), comparison: `${providerLabel} · ${analysis.modelVersion}` })),
        statementPeriods: statementRows.length ? incomeStatements.map((statement) => statement.fiscalDate.slice(0, 4)) : [],
        statementRows,
        transcripts: [],
        source: fundamentalsResult.meta.provider,
        unavailableSections: ["Fair-value models", "Solidity scores", "Revenue by product", "Historical transcripts"],
      };
    }, async () => { const data = await this.mock.getFundamentals(ref); return { ...data, summaryColumns: [[{ label: "Data source", value: "DEMO FALLBACK" }], ...data.summaryColumns], source: "mock" as const }; });
  }

  async getPoliticalActivity(ref: InstrumentRef) {
    const symbol = refSymbol(ref);
    return this.fallback<PoliticalData>("political", symbol, async () => ({ chartSeries: toTimeSeries((await financialProviderRouter.chart(symbol, "5Y")).data.points), trades: [], source: "unavailable" as const }), async () => ({ chartSeries: [], trades: [], source: "unavailable" as const }));
  }

  async getNews(ref: InstrumentRef) {
    const symbol = refSymbol(ref);
    return this.fallback<NewsData>("news", symbol, async () => {
      const result = await financialProviderRouter.news(symbol);
      const articles = result.data;
      return {
        recaps: [],
        articles: articles.map((item, index) => ({ id: index + 1, title: item.title, source: item.publisher, date: new Date(item.publishedAt).toLocaleDateString("en-GB"), url: item.url })),
        source: result.meta.provider,
      };
    }, async () => ({ recaps: [], articles: [], source: "unavailable" as const }));
  }

  async getDashboardData(): Promise<DashboardData> {
    return this.fallback<DashboardData>("dashboard", undefined, async () => {
      const [watchlist, spotlight, chart, pulseQuotes] = await Promise.all([
        this.getWatchlist(), this.getInstrument(DEFAULT_REF), financialProviderRouter.chart(DEFAULT_SYMBOL, "1Y"), financialProviderRouter.quotes(["^GSPC", "^NDX", "^TNX", "^VIX"]),
      ]);
      const demo = await this.mock.getDashboardData();
      return {
        ...demo,
        pulse: pulseQuotes.data.map((item) => ({ name: item.name, value: item.price.toLocaleString("en-US", { maximumFractionDigits: 2 }), change: `${item.changePercent >= 0 ? "+" : ""}${item.changePercent.toFixed(2)}%` })),
        watchlist,
        spotlight,
        spotlightSeries: toTimeSeries(chart.data.points),
        briefTitle: "Narrative automatica non disponibile",
        briefBody: "Prezzi e indicatori provengono dai provider server-side configurati; il brief editoriale resta in modalità demo e non viene presentato come dato reale.",
        source: chart.meta.provider,
        demoSections: ["Portfolio personale", "Signal summary", "Editorial brief"],
      };
    }, async () => ({ ...(await this.mock.getDashboardData()), source: "mock" as const, demoSections: ["Entire dashboard"] }));
  }

  async getCalendarData() { const data = await this.mock.getCalendarData(); return { ...data, selectedEventTitle: "Modalità demo", selectedEventDescription: "Il calendario composito non è ancora collegato alla persistenza; questi eventi sono dimostrativi." }; }
  async getPortfolioData() { return this.mock.getPortfolioData(); }
}
