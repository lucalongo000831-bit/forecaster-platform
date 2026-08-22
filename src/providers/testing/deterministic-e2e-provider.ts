import "server-only";

import { normalizeSymbol } from "@/services/yahoo/symbol-resolver";
import type {
  ChartInterval,
  ChartRange,
  InstrumentKind,
  MarketChartDto,
  MarketChartPoint,
  MarketFundamentalsDto,
  MarketProfileDto,
  MarketQuoteDto,
  ResolvedInstrument,
  SearchInstrument,
} from "@/types";
import { ProviderError } from "../errors";
import { providerResult } from "../metadata";
import type {
  AnalystConsensus,
  AnalystEstimate,
  AnalystRating,
  DividendEvent,
  EconomicEvent,
  EarningsEvent,
  FinancialStatement,
  FundamentalRatios,
  MacroObservation,
  MarketStatus,
  PoliticalDisclosure,
  ProviderNewsItem,
  StatementKind,
  StatementPeriod,
} from "../types";

export const DETERMINISTIC_E2E_FLAG = "KAIRO_E2E_PROVIDER_FIXTURES";
export const DETERMINISTIC_E2E_RUN_FLAG = "KAIRO_E2E_RUN";
const FIXTURE_REQUEST_ID = "deterministic-e2e-provider";
const FIXTURE_AS_OF = "2026-08-20T20:00:00.000Z";

type FixtureIdentity = {
  name: string;
  exchange: string;
  quoteType: string;
  currency: string;
  country: string;
  sector: string | null;
  industry: string | null;
  price: number;
};

const IDENTITIES: Record<string, FixtureIdentity> = {
  AAPL: { name: "Apple Inc.", exchange: "NASDAQ", quoteType: "EQUITY", currency: "USD", country: "US", sector: "Technology", industry: "Consumer Electronics", price: 214.3 },
  MSFT: { name: "Microsoft Corporation", exchange: "NASDAQ", quoteType: "EQUITY", currency: "USD", country: "US", sector: "Technology", industry: "Software", price: 507.2 },
  NVDA: { name: "NVIDIA Corporation", exchange: "NASDAQ", quoteType: "EQUITY", currency: "USD", country: "US", sector: "Technology", industry: "Semiconductors", price: 182.4 },
  TSLA: { name: "Tesla, Inc.", exchange: "NASDAQ", quoteType: "EQUITY", currency: "USD", country: "US", sector: "Consumer Cyclical", industry: "Auto Manufacturers", price: 331.7 },
  AMZN: { name: "Amazon.com, Inc.", exchange: "NASDAQ", quoteType: "EQUITY", currency: "USD", country: "US", sector: "Consumer Cyclical", industry: "Internet Retail", price: 231.1 },
  META: { name: "Meta Platforms, Inc.", exchange: "NASDAQ", quoteType: "EQUITY", currency: "USD", country: "US", sector: "Communication Services", industry: "Internet Content", price: 742.8 },
  SPY: { name: "SPDR S&P 500 ETF Trust", exchange: "NYSEARCA", quoteType: "ETF", currency: "USD", country: "US", sector: null, industry: null, price: 645.2 },
  QQQ: { name: "Invesco QQQ Trust", exchange: "NASDAQ", quoteType: "ETF", currency: "USD", country: "US", sector: null, industry: null, price: 582.6 },
  "^GSPC": { name: "S&P 500", exchange: "INDEX", quoteType: "INDEX", currency: "USD", country: "US", sector: null, industry: null, price: 6468.5 },
  "^IXIC": { name: "NASDAQ Composite", exchange: "INDEX", quoteType: "INDEX", currency: "USD", country: "US", sector: null, industry: null, price: 21690.4 },
  "BTC-USD": { name: "Bitcoin USD", exchange: "CRYPTO", quoteType: "CRYPTOCURRENCY", currency: "USD", country: "Global", sector: null, industry: null, price: 118420 },
  "ETH-USD": { name: "Ethereum USD", exchange: "CRYPTO", quoteType: "CRYPTOCURRENCY", currency: "USD", country: "Global", sector: null, industry: null, price: 4620 },
  "ENI.MI": { name: "Eni S.p.A.", exchange: "MIL", quoteType: "EQUITY", currency: "EUR", country: "IT", sector: "Energy", industry: "Oil & Gas Integrated", price: 15.8 },
  "STLAM.MI": { name: "Stellantis N.V.", exchange: "MIL", quoteType: "EQUITY", currency: "EUR", country: "NL", sector: "Consumer Cyclical", industry: "Auto Manufacturers", price: 9.2 },
};

const chartCache = new Map<string, MarketChartPoint[]>();

export function isDeterministicE2EProviderEnabled(source: Record<string, string | undefined> = process.env) {
  return source[DETERMINISTIC_E2E_FLAG] === "true"
    && source[DETERMINISTIC_E2E_RUN_FLAG] === "playwright"
    && source.VERCEL !== "1"
    && source.VERCEL_ENV === undefined;
}

function identity(symbolInput: string) {
  const symbol = normalizeSymbol(symbolInput);
  if (symbol === "E2E-UNAVAILABLE") throw new ProviderError("yahoo", "UPSTREAM_UNAVAILABLE", "Deterministic unavailable-state fixture.", false, 503);
  return { symbol, value: IDENTITIES[symbol] ?? { name: `${symbol} Test Instrument`, exchange: "NASDAQ", quoteType: "EQUITY", currency: "USD", country: "US", sector: "Industrials", industry: "Diversified", price: 100 } };
}

function result<T>(data: T, sourceTimestamp: string | null = FIXTURE_AS_OF) {
  return providerResult("yahoo", data, { sourceTimestamp, freshness: "cached", freshnessType: "CACHED", quality: "verified", requestId: FIXTURE_REQUEST_ID });
}

function assetKind(symbol: string, quoteType: string): InstrumentKind {
  if (symbol.endsWith("-USD")) return "CRYPTO";
  if (symbol.startsWith("^") || quoteType === "INDEX") return "INDEX";
  if (quoteType === "ETF") return "ETF";
  return "EQUITY";
}

function intervalFor(range: ChartRange, requested?: string | null): ChartInterval {
  if (requested && ["1m", "2m", "5m", "15m", "30m", "60m", "90m", "1h", "1d", "5d", "1wk", "1mo", "3mo"].includes(requested)) return requested as ChartInterval;
  return range === "1D" ? "5m" : range === "5D" ? "15m" : "1d";
}

function history(symbolInput: string) {
  const { symbol, value } = identity(symbolInput);
  const cached = chartCache.get(symbol);
  if (cached) return cached;
  const crypto = symbol.endsWith("-USD");
  const startYear = crypto ? 2017 : 1998;
  const points: MarketChartPoint[] = [];
  let close = value.price * (crypto ? 0.06 : 0.18);
  let day = 0;
  for (let timestamp = Date.UTC(startYear, 0, 1); timestamp <= Date.parse(FIXTURE_AS_OF); timestamp += 86_400_000) {
    const date = new Date(timestamp);
    if (!crypto && [0, 6].includes(date.getUTCDay())) continue;
    const drift = 0.00024 + Math.sin(day / 19) * 0.004 + Math.cos(day / 61) * 0.002;
    const open = close;
    close = Math.max(0.01, close * Math.exp(drift));
    points.push({ timestamp: date.toISOString(), open, high: Math.max(open, close) * 1.008, low: Math.min(open, close) * 0.992, close, adjustedClose: close, volume: 1_000_000 + day * 113 });
    day += 1;
  }
  const scale = value.price / points.at(-1)!.close;
  const scaled = points.map((point) => ({ ...point, open: point.open * scale, high: point.high * scale, low: point.low * scale, close: point.close * scale, adjustedClose: point.adjustedClose! * scale }));
  chartCache.set(symbol, scaled);
  return scaled;
}

function rangeStart(range: ChartRange) {
  const days: Partial<Record<ChartRange, number>> = { "1D": 1, "5D": 5, "1M": 31, "3M": 93, "6M": 186, YTD: 233, "1Y": 366, "5Y": 1_827, "10Y": 3_653 };
  return days[range] ? Date.parse(FIXTURE_AS_OF) - days[range]! * 86_400_000 : Number.NEGATIVE_INFINITY;
}

function quote(symbolInput: string): MarketQuoteDto {
  const { symbol, value } = identity(symbolInput);
  const previousClose = value.price / 1.012;
  return { symbol, name: value.name, exchange: value.exchange, quoteType: value.quoteType, currency: value.currency, price: value.price, change: value.price - previousClose, changePercent: 1.2, open: previousClose * 1.002, previousClose, dayLow: value.price * 0.985, dayHigh: value.price * 1.009, volume: 23_400_000, marketCap: ["ETF", "INDEX", "CRYPTOCURRENCY"].includes(value.quoteType) ? null : value.price * 15_000_000_000, bid: value.price * 0.9998, ask: value.price * 1.0002, marketState: value.quoteType === "CRYPTOCURRENCY" ? "REGULAR" : "CLOSED", asOf: FIXTURE_AS_OF, isDelayed: true, source: "mock" };
}

function profile(symbolInput: string): MarketProfileDto {
  const { symbol, value } = identity(symbolInput);
  return { symbol, name: value.name, exchange: value.exchange, quoteType: value.quoteType, currency: value.currency, country: value.country, sector: value.sector, industry: value.industry, description: `Deterministic automated-test profile for ${value.name}.`, employees: value.quoteType === "EQUITY" ? 25_000 : null, website: null, source: "mock" };
}

function fundamentals(symbolInput: string): MarketFundamentalsDto {
  const { symbol, value } = identity(symbolInput);
  const applicable = value.quoteType === "EQUITY";
  return { symbol, marketCap: applicable ? value.price * 15_000_000_000 : null, enterpriseValue: applicable ? value.price * 15_500_000_000 : null, trailingEps: applicable ? 6.4 : null, trailingPe: applicable ? value.price / 6.4 : null, forwardPe: applicable ? value.price / 7.1 : null, priceToBook: applicable ? 8.2 : null, dividendRate: applicable ? 1.1 : null, dividendYield: applicable ? 0.006 : null, returnOnEquity: applicable ? 0.31 : null, debtToEquity: applicable ? 0.62 : null, profitMargins: applicable ? 0.24 : null, revenue: applicable ? 390_000_000_000 : null, freeCashflow: applicable ? 92_000_000_000 : null, sharesOutstanding: applicable ? 15_000_000_000 : null, source: "mock" };
}

function statementRows(symbolInput: string, kind: StatementKind, period: StatementPeriod, limit: number): FinancialStatement[] {
  const { symbol, value } = identity(symbolInput);
  if (value.quoteType !== "EQUITY") return [];
  return Array.from({ length: limit }, (_, index) => {
    const year = 2025 - (period === "annual" ? index : Math.floor(index / 4));
    const quarter = period === "quarter" ? 12 - (index % 4) * 3 : 12;
    const factor = 1 - index * (period === "annual" ? 0.055 : 0.014);
    const revenue = 390_000_000_000 * factor;
    const values: Record<string, number | null> = kind === "income"
      ? { revenue, grossProfit: revenue * 0.45, operatingIncome: revenue * 0.3, netIncome: revenue * 0.24, ebitda: revenue * 0.34, epsdiluted: 6.4 * factor, weightedAverageShsOutDil: 15_000_000_000 }
      : kind === "balance-sheet"
        ? { cashAndCashEquivalents: 62_000_000_000 * factor, totalAssets: 365_000_000_000 * factor, totalDebt: 101_000_000_000 * factor, totalStockholdersEquity: 74_000_000_000 * factor }
        : { operatingCashFlow: 118_000_000_000 * factor, capitalExpenditure: -12_000_000_000 * factor, freeCashFlow: 106_000_000_000 * factor };
    return { symbol, kind, period, fiscalDate: `${year}-${String(quarter).padStart(2, "0")}-28`, reportedCurrency: value.currency, acceptedAt: `${year + 1}-02-01T12:00:00.000Z`, values };
  });
}

export class DeterministicE2EProvider {
  search(queryInput: string) {
    const query = queryInput.trim().toUpperCase();
    const data: SearchInstrument[] = Object.entries(IDENTITIES).filter(([symbol, value]) => symbol.includes(query) || value.name.toUpperCase().includes(query)).slice(0, 12).map(([symbol, value]) => ({ symbol, name: value.name, type: value.quoteType === "ETF" ? "ETF" : value.quoteType === "INDEX" ? "Index" : value.quoteType === "CRYPTOCURRENCY" ? "Crypto" : "Stock", venue: value.exchange, price: value.price, href: `/instrument/${value.quoteType === "CRYPTOCURRENCY" ? "crypto" : value.exchange.toLowerCase()}/${encodeURIComponent(symbol.toLowerCase())}/overview`, currency: value.currency, source: "mock" }));
    return Promise.resolve(result(data));
  }
  quote(symbol: string) { return Promise.resolve(result(quote(symbol))); }
  quotes(symbols: string[]) { return Promise.resolve(result(symbols.map(quote))); }
  chart(symbolInput: string, range: ChartRange, interval?: string | null) {
    const { symbol, value } = identity(symbolInput);
    const points = history(symbol).filter((point) => Date.parse(point.timestamp) >= rangeStart(range));
    const data: MarketChartDto = { symbol, currency: value.currency, exchange: value.exchange, range, interval: intervalFor(range, interval), previousClose: points.at(-2)?.close ?? null, isDelayed: true, asOf: FIXTURE_AS_OF, points, source: "mock" };
    return Promise.resolve(result(data));
  }
  marketStatus(market = "US") { const data: MarketStatus = { market, state: "closed", asOf: FIXTURE_AS_OF, nextOpen: "2026-08-21T13:30:00.000Z", nextClose: "2026-08-21T20:00:00.000Z" }; return Promise.resolve(result(data)); }
  profile(symbol: string) { return Promise.resolve(result(profile(symbol))); }
  fundamentals(symbol: string) { return Promise.resolve(result(fundamentals(symbol))); }
  statements(symbol: string, kind: StatementKind, period: StatementPeriod, limit = 5) { return Promise.resolve(result(statementRows(symbol, kind, period, limit), statementRows(symbol, kind, period, limit)[0]?.acceptedAt ?? null)); }
  ratios(symbolInput: string, period: StatementPeriod, limit = 5) { const { symbol } = identity(symbolInput); const data: FundamentalRatios[] = Array.from({ length: limit }, (_, index) => ({ symbol, period, date: `${2025 - index}-12-28`, values: { currentRatio: 1.4, debtEquityRatio: 0.62, returnOnEquity: 0.31, netProfitMargin: 0.24 } })); return Promise.resolve(result(data)); }
  analystConsensus(symbolInput: string) { const { symbol, value } = identity(symbolInput); const data: AnalystConsensus = { symbol, targetLow: value.price * 0.82, targetHigh: value.price * 1.28, targetMedian: value.price * 1.08, targetConsensus: value.price * 1.09, analystCount: value.quoteType === "EQUITY" ? 32 : null, currency: value.currency, asOf: "2026-08-19" }; return Promise.resolve(result(data, data.asOf)); }
  analystEstimates(symbolInput: string, limit = 8) { const { symbol, value } = identity(symbolInput); const data: AnalystEstimate[] = value.quoteType === "EQUITY" ? Array.from({ length: limit }, (_, index) => ({ symbol, date: `${2026 + index}-12-31`, period: "FY", estimatedRevenueAverage: 410_000_000_000 * (1 + index * 0.06), estimatedEpsAverage: 7.1 * (1 + index * 0.08), analystCount: 30 })) : []; return Promise.resolve(result(data)); }
  analystRatings(symbolInput: string) { const { symbol, value } = identity(symbolInput); const data: AnalystRating = { symbol, strongBuy: value.quoteType === "EQUITY" ? 14 : null, buy: value.quoteType === "EQUITY" ? 12 : null, hold: value.quoteType === "EQUITY" ? 6 : null, sell: 0, strongSell: 0, consensus: value.quoteType === "EQUITY" ? "Buy" : null }; return Promise.resolve(result(data)); }
  growth(symbolInput: string, period: StatementPeriod, limit = 10) { const { symbol } = identity(symbolInput); return Promise.resolve(result(Array.from({ length: limit }, (_, index) => ({ symbol, date: `${2025 - index}-12-28`, period, values: { revenueGrowth: 0.08, netIncomeGrowth: 0.1, freeCashFlowGrowth: 0.09 } })))); }
  peers(symbolInput: string) { const { symbol, value } = identity(symbolInput); return Promise.resolve(result(value.quoteType === "EQUITY" ? ["MSFT", "NVDA", "AAPL"].filter((peer) => peer !== symbol) : [])); }
  earningsCalendar(from: string, to: string, symbolInput?: string) { const symbols = symbolInput ? [identity(symbolInput).symbol] : ["AAPL", "NVDA"]; const data: EarningsEvent[] = symbols.map((symbol) => ({ symbol, date: from <= "2026-08-25" && to >= "2026-08-25" ? "2026-08-25" : from, time: "amc", estimatedEps: 1.7, actualEps: null, estimatedRevenue: 98_000_000_000, actualRevenue: null, currency: identity(symbol).value.currency })); return Promise.resolve(result(data)); }
  dividendCalendar(from: string, to: string, symbolInput?: string) { void to; const symbol = symbolInput ? identity(symbolInput).symbol : "AAPL"; const data: DividendEvent[] = identity(symbol).value.quoteType === "EQUITY" ? [{ symbol, date: from, recordDate: from, paymentDate: from, declarationDate: from, amount: 0.25, adjustedAmount: 0.25, yield: 0.005, frequency: "quarterly", currency: identity(symbol).value.currency }] : []; return Promise.resolve(result(data)); }
  economicCalendar(from: string, to: string) { void to; const data: EconomicEvent[] = [{ date: from, country: "US", event: "Consumer Price Index", currency: "USD", previous: 2.7, estimate: 2.8, actual: null, impact: "HIGH", unit: "%" }]; return Promise.resolve(result(data)); }
  news(symbolInput: string, limit = 20) { const { symbol } = identity(symbolInput); const data: ProviderNewsItem[] = Array.from({ length: Math.min(limit, 3) }, (_, index) => ({ id: `e2e-${symbol}-${index}`, title: `${symbol} deterministic research update ${index + 1}`, publisher: "Kairo E2E Fixture", publishedAt: `2026-08-${19 - index}T12:00:00.000Z`, url: "https://example.invalid/e2e-fixture", relatedSymbols: [symbol], summary: "Synthetic fixture used only by local automated tests.", overallSentimentScore: 0.18, overallSentimentLabel: "Neutral", topics: ["financial_markets"], tickerSentiment: [{ symbol, relevance: 0.9, score: 0.18, label: "Neutral" }] })); return Promise.resolve(result(data)); }
  topicNews(topics: string[], limit = 20) { return this.news("AAPL", limit).then((value) => ({ ...value, data: value.data.map((item) => ({ ...item, topics })) })); }
  political(chamber: "HOUSE" | "SENATE", symbolInput?: string, limit = 100) { const symbol = symbolInput ? identity(symbolInput).symbol : "AAPL"; const row: PoliticalDisclosure = { id: `e2e-${chamber}-${symbol}`, sourceId: "e2e-fixture", politician: "Test Representative", chamber, party: null, state: null, district: null, symbol, asset: identity(symbol).value.name, assetType: "Stock", transactionType: "PURCHASE", rawTransactionType: "Purchase", transactionDate: "2026-08-10", disclosureDate: "2026-08-14", amountRange: "$1,001 - $15,000", ownership: null, capitalGains: null, sourceUrl: null, filingId: null, filingType: null, amendment: false, provider: "fmp", sourceLabel: "Deterministic E2E fixture" }; return Promise.resolve(result([row].slice(0, limit))); }
  macro(indicator: MacroObservation["indicator"]) { const data: MacroObservation[] = [{ indicator, date: "2026-08-01", value: indicator === "RATES" ? 4.25 : indicator === "INFLATION" ? 2.7 : indicator === "GDP" ? 2.1 : 4.2, unit: "%", country: "US" }]; return Promise.resolve(result(data)); }
  resolveInstrument(symbolInput: string): ResolvedInstrument {
    const { symbol, value } = identity(symbolInput);
    const kind = assetKind(symbol, value.quoteType);
    const issuer = kind === "EQUITY" ? { legalName: value.name, countryCode: value.country, lei: null, cik: null, isin: null, website: null, sector: value.sector, industry: value.industry, reportingCurrency: value.currency, comparableHistoryStartDate: "1998-01-01" } : null;
    return { canonicalSymbol: symbol, name: value.name, kind, exchange: value.exchange, mic: null, currency: value.currency, tradingCurrency: value.currency, countryCode: value.country, issuer, mappings: [{ provider: "yahoo", symbol, exchangeCode: value.exchange, providerInstrumentId: FIXTURE_REQUEST_ID, confidence: 1, verifiedAt: FIXTURE_AS_OF }], resolutionQuality: "verified", warnings: [] };
  }
}

let singleton: DeterministicE2EProvider | null | undefined;

export function deterministicE2EProvider() {
  if (!isDeterministicE2EProviderEnabled()) return null;
  if (singleton === undefined) singleton = new DeterministicE2EProvider();
  return singleton;
}
