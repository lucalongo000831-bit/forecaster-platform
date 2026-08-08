import "server-only";

import { getServerEnvironment } from "@/schemas/env";
import type { MarketFundamentalsDto, MarketProfileDto } from "@/types";
import { normalizeSymbol } from "@/services/yahoo/symbol-resolver";
import { ProviderError } from "../errors";
import { booleanValue, fmpGet, numberValue, stringValue } from "../fmp/client";
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
  FundamentalsProvider,
  StatementKind,
  StatementPeriod,
} from "../types";

const NON_VALUE_FIELDS = new Set(["symbol", "date", "fillingDate", "acceptedDate", "calendarYear", "period", "reportedCurrency", "cik", "link", "finalLink"]);

function numericValues(record: Record<string, unknown>) {
  const values: Record<string, number | null> = {};
  for (const [key, raw] of Object.entries(record)) {
    if (NON_VALUE_FIELDS.has(key)) continue;
    if (raw === null) values[key] = null;
    else {
      const parsed = typeof raw === "number" ? raw : typeof raw === "string" && raw.trim() ? Number(raw) : Number.NaN;
      if (Number.isFinite(parsed)) values[key] = parsed;
    }
  }
  return values;
}

function statementEndpoint(kind: StatementKind) {
  if (kind === "income") return "income-statement";
  if (kind === "balance-sheet") return "balance-sheet-statement";
  return "cash-flow-statement";
}

export class FmpFundamentalsAdapter implements FundamentalsProvider {
  readonly name = "fmp" as const;
  isConfigured() { return Boolean(getServerEnvironment().FMP_API_KEY); }
  supportsSymbol(symbol: string) {
    try { normalizeSymbol(symbol); return !symbol.startsWith("^") && !symbol.includes("=") && !symbol.endsWith("-USD"); }
    catch { return false; }
  }

  async getCompanyProfile(symbolInput: string) {
    const symbol = normalizeSymbol(symbolInput);
    const row = (await fmpGet("profile", { symbol }, "profile"))[0];
    if (!row || !stringValue(row, "symbol")) throw new ProviderError(this.name, "NOT_FOUND", "Profilo FMP non disponibile.", false, 404);
    const data: MarketProfileDto = {
      symbol,
      name: stringValue(row, "companyName", "name") ?? symbol,
      exchange: stringValue(row, "exchangeFullName", "exchange", "exchangeShortName") ?? "—",
      quoteType: booleanValue(row, "isEtf") === true ? "ETF" : "EQUITY",
      currency: stringValue(row, "currency") ?? "USD",
      country: stringValue(row, "country"),
      sector: stringValue(row, "sector"),
      industry: stringValue(row, "industry"),
      description: stringValue(row, "description"),
      employees: numberValue(row, "fullTimeEmployees"),
      website: stringValue(row, "website"),
      source: "fmp",
    };
    return providerResult(this.name, data, { freshness: "cached" });
  }

  async getFundamentals(symbolInput: string) {
    const symbol = normalizeSymbol(symbolInput);
    const [metricRows, ratioRows, quoteRows] = await Promise.all([
      fmpGet("key-metrics-ttm", { symbol }, "key-metrics-ttm"),
      fmpGet("ratios-ttm", { symbol }, "ratios-ttm"),
      fmpGet("quote", { symbol }, "quote"),
    ]);
    const metrics = metricRows[0] ?? {};
    const ratios = ratioRows[0] ?? {};
    const quote = quoteRows[0] ?? {};
    const data: MarketFundamentalsDto = {
      symbol,
      marketCap: numberValue(quote, "marketCap", "mktCap"),
      enterpriseValue: numberValue(metrics, "enterpriseValueTTM", "enterpriseValue"),
      trailingEps: numberValue(quote, "eps", "epsTTM"),
      trailingPe: numberValue(ratios, "priceToEarningsRatioTTM", "priceEarningsRatioTTM", "peRatioTTM"),
      forwardPe: numberValue(ratios, "forwardPriceToEarningsGrowthRatioTTM"),
      priceToBook: numberValue(ratios, "priceToBookRatioTTM"),
      dividendRate: numberValue(quote, "annualDividend"),
      dividendYield: numberValue(ratios, "dividendYieldTTM"),
      returnOnEquity: numberValue(ratios, "returnOnEquityTTM"),
      debtToEquity: numberValue(ratios, "debtToEquityRatioTTM", "debtEquityRatioTTM"),
      profitMargins: numberValue(ratios, "netProfitMarginTTM"),
      revenue: numberValue(metrics, "revenuePerShareTTM") !== null && numberValue(quote, "sharesOutstanding") !== null
        ? (numberValue(metrics, "revenuePerShareTTM") as number) * (numberValue(quote, "sharesOutstanding") as number)
        : null,
      freeCashflow: numberValue(metrics, "freeCashFlowTTM", "freeCashFlowPerShareTTM"),
      sharesOutstanding: numberValue(quote, "sharesOutstanding"),
      source: "fmp",
    };
    return providerResult(this.name, data, { freshness: "cached", quality: Object.values(data).some((value) => typeof value === "number") ? "verified" : "partial" });
  }

  async getStatements(symbolInput: string, kind: StatementKind, period: StatementPeriod, limit = 5) {
    const symbol = normalizeSymbol(symbolInput);
    const rows = await fmpGet(statementEndpoint(kind), { symbol, period, limit: Math.min(20, Math.max(1, limit)) }, `statement:${kind}`);
    const data = rows.flatMap((row): FinancialStatement[] => {
      const fiscalDate = stringValue(row, "date", "fillingDate");
      if (!fiscalDate) return [];
      return [{
        symbol,
        kind,
        period,
        fiscalDate,
        reportedCurrency: stringValue(row, "reportedCurrency"),
        acceptedAt: stringValue(row, "acceptedDate"),
        values: numericValues(row),
      }];
    });
    return providerResult(this.name, data, { sourceTimestamp: data[0]?.acceptedAt ?? data[0]?.fiscalDate ?? null, freshness: "cached", quality: data.length ? "verified" : "unavailable" });
  }

  async getRatios(symbolInput: string, period: StatementPeriod, limit = 5) {
    const symbol = normalizeSymbol(symbolInput);
    const rows = await fmpGet("ratios", { symbol, period, limit: Math.min(20, Math.max(1, limit)) }, "ratios");
    const data: FundamentalRatios[] = rows.map((row) => ({
      symbol,
      period: stringValue(row, "period") ?? period,
      date: stringValue(row, "date"),
      values: numericValues(row),
    }));
    return providerResult(this.name, data, { sourceTimestamp: data[0]?.date ?? null, freshness: "cached", quality: data.length ? "verified" : "unavailable" });
  }

  async getAnalystConsensus(symbolInput: string) {
    const symbol = normalizeSymbol(symbolInput);
    const row = (await fmpGet("price-target-consensus", { symbol }, "analyst-consensus"))[0] ?? {};
    const data: AnalystConsensus = {
      symbol,
      targetLow: numberValue(row, "targetLow"),
      targetHigh: numberValue(row, "targetHigh"),
      targetMedian: numberValue(row, "targetMedian"),
      targetConsensus: numberValue(row, "targetConsensus"),
      analystCount: numberValue(row, "analystCount", "count"),
      currency: stringValue(row, "currency"),
      asOf: stringValue(row, "lastUpdated", "date"),
    };
    return providerResult(this.name, data, { sourceTimestamp: data.asOf, freshness: "cached", quality: data.targetConsensus === null ? "partial" : "verified" });
  }

  async getAnalystEstimates(symbolInput: string, limit = 8) {
    const symbol = normalizeSymbol(symbolInput);
    const rows = await fmpGet("analyst-estimates", { symbol, period: "annual", limit: Math.min(20, Math.max(1, limit)) }, "analyst-estimates");
    const data: AnalystEstimate[] = rows.map((row) => ({ symbol, date: stringValue(row, "date"), period: stringValue(row, "period"), estimatedRevenueAverage: numberValue(row, "estimatedRevenueAvg", "estimatedRevenueAverage"), estimatedEpsAverage: numberValue(row, "estimatedEpsAvg", "estimatedEpsAverage"), analystCount: numberValue(row, "numberAnalystsEstimatedRevenue", "numberAnalystEstimatedEps") }));
    return providerResult(this.name, data, { sourceTimestamp: data[0]?.date ?? null, freshness: "cached", quality: data.length ? "verified" : "partial" });
  }

  async getAnalystRatings(symbolInput: string) {
    const symbol = normalizeSymbol(symbolInput);
    const row = (await fmpGet("grades-consensus", { symbol }, "analyst-ratings"))[0] ?? {};
    const data: AnalystRating = { symbol, strongBuy: numberValue(row, "strongBuy"), buy: numberValue(row, "buy"), hold: numberValue(row, "hold"), sell: numberValue(row, "sell"), strongSell: numberValue(row, "strongSell"), consensus: stringValue(row, "consensus") };
    return providerResult(this.name, data, { freshness: "cached", quality: data.consensus || Object.values(data).some((value) => typeof value === "number") ? "verified" : "partial" });
  }

  async getGrowth(symbolInput: string, period: StatementPeriod = "annual", limit = 10) {
    const symbol = normalizeSymbol(symbolInput);
    const rows = await fmpGet("financial-growth", { symbol, period, limit: Math.min(20, Math.max(1, limit)) }, "financial-growth");
    const data = rows.map((row) => ({ symbol, date: stringValue(row, "date"), period: stringValue(row, "period") ?? period, values: numericValues(row) }));
    return providerResult(this.name, data, { sourceTimestamp: data[0]?.date ?? null, freshness: "cached", quality: data.length ? "verified" : "partial" });
  }

  async getPeers(symbolInput: string) {
    const symbol = normalizeSymbol(symbolInput);
    const rows = await fmpGet("stock-peers", { symbol }, "stock-peers");
    const peers = rows.flatMap((row) => {
      const values = row.peersList ?? row.peers ?? row.symbols;
      if (Array.isArray(values)) return values.filter((value): value is string => typeof value === "string").map((value) => value.toUpperCase());
      const peer = stringValue(row, "symbol"); return peer && peer !== symbol ? [peer] : [];
    });
    const data = [...new Set(peers)].filter((peer) => peer !== symbol).slice(0, 10);
    return providerResult(this.name, data, { freshness: "cached", quality: data.length ? "verified" : "partial" });
  }

  async getEarningsCalendar(from: string, to: string, symbolInput?: string) {
    const symbol = symbolInput ? normalizeSymbol(symbolInput) : undefined;
    const rows = await fmpGet("earnings-calendar", { from, to, symbol }, "earnings-calendar");
    const data = rows.flatMap((row): EarningsEvent[] => {
      const eventSymbol = stringValue(row, "symbol");
      const date = stringValue(row, "date");
      if (!eventSymbol || !date) return [];
      return [{ symbol: eventSymbol, date, time: stringValue(row, "time"), estimatedEps: numberValue(row, "epsEstimated"), actualEps: numberValue(row, "epsActual"), estimatedRevenue: numberValue(row, "revenueEstimated"), actualRevenue: numberValue(row, "revenueActual"), currency: stringValue(row, "currency") }];
    });
    return providerResult(this.name, data, { sourceTimestamp: new Date().toISOString(), freshness: "cached", quality: data.length ? "verified" : "partial" });
  }

  async getDividendCalendar(from: string, to: string, symbolInput?: string) {
    const symbol = symbolInput ? normalizeSymbol(symbolInput) : undefined;
    const rows = await fmpGet("dividends-calendar", { from, to, symbol }, "dividends-calendar");
    const data = rows.flatMap((row): DividendEvent[] => {
      const eventSymbol = stringValue(row, "symbol"); const date = stringValue(row, "date");
      if (!eventSymbol || !date) return [];
      return [{ symbol: eventSymbol, date, recordDate: stringValue(row, "recordDate"), paymentDate: stringValue(row, "paymentDate"), declarationDate: stringValue(row, "declarationDate"), amount: numberValue(row, "dividend"), adjustedAmount: numberValue(row, "adjDividend", "adjustedDividend"), yield: numberValue(row, "yield"), frequency: stringValue(row, "frequency"), currency: stringValue(row, "currency") }];
    });
    return providerResult(this.name, data, { sourceTimestamp: new Date().toISOString(), freshness: "cached", quality: data.length ? "verified" : "partial" });
  }

  async getEconomicCalendar(from: string, to: string) {
    const rows = await fmpGet("economic-calendar", { from, to }, "economic-calendar");
    const data = rows.flatMap((row): EconomicEvent[] => {
      const date = stringValue(row, "date"); const event = stringValue(row, "event", "name");
      if (!date || !event) return [];
      return [{ date, event, country: stringValue(row, "country"), currency: stringValue(row, "currency"), previous: numberValue(row, "previous"), estimate: numberValue(row, "estimate"), actual: numberValue(row, "actual"), impact: stringValue(row, "impact"), unit: stringValue(row, "unit") }];
    });
    return providerResult(this.name, data, { sourceTimestamp: new Date().toISOString(), freshness: "cached", quality: data.length ? "verified" : "partial" });
  }
}
