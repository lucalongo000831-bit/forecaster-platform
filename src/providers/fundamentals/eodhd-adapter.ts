import "server-only";

import type { MarketFundamentalsDto, MarketProfileDto } from "@/types";
import { eodhdGet } from "../eodhd/client";
import { toEodhdSymbol } from "../eodhd/symbols";
import { ProviderError } from "../errors";
import { providerResult } from "../metadata";
import { numericValue, objectValue, textValue } from "../shared";
import type { AnalystConsensus, EarningsEvent, EconomicEvent, FinancialStatement, FundamentalRatios, FundamentalsProvider, ProviderResult, StatementKind, StatementPeriod } from "../types";

function rowsFromSection(raw: Record<string, unknown>, kind: StatementKind, period: StatementPeriod) {
  const financials = objectValue(raw.Financials);
  const sectionName = kind === "income" ? "Income_Statement" : kind === "balance-sheet" ? "Balance_Sheet" : "Cash_Flow";
  const section = objectValue(financials[sectionName]);
  return objectValue(section[period === "annual" ? "yearly" : "quarterly"]);
}

function values(record: Record<string, unknown>) {
  const result: Record<string, number | null> = {};
  for (const [key, raw] of Object.entries(record)) {
    if (["date", "filing_date", "currency_symbol"].includes(key)) continue;
    const parsed = typeof raw === "number" ? raw : typeof raw === "string" && raw.trim() ? Number(raw) : Number.NaN;
    if (Number.isFinite(parsed)) result[key] = parsed;
    else if (raw === null) result[key] = null;
  }
  return result;
}

async function fundamentals(symbolInput: string) {
  const providerSymbol = toEodhdSymbol(symbolInput);
  if (!providerSymbol) throw new ProviderError("eodhd", "UNSUPPORTED_SYMBOL", "Simbolo non supportato da EODHD.", false, 422);
  return objectValue(await eodhdGet(`fundamentals/${encodeURIComponent(providerSymbol)}`, {}, "fundamentals"));
}

export class EodhdFundamentalsAdapter implements FundamentalsProvider {
  readonly name = "eodhd" as const;
  isConfigured() { return Boolean(process.env.EODHD_API_TOKEN); }
  supportsSymbol(symbol: string) { try { return Boolean(toEodhdSymbol(symbol)); } catch { return false; } }

  async getCompanyProfile(symbol: string) {
    const raw = await fundamentals(symbol); const general = objectValue(raw.General);
    const data: MarketProfileDto = { symbol, name: textValue(general, "Name") ?? symbol, exchange: textValue(general, "Exchange", "PrimaryTicker") ?? "—", quoteType: textValue(general, "Type") ?? "EQUITY", currency: textValue(general, "CurrencyCode") ?? "USD", country: textValue(general, "CountryISO", "CountryName"), sector: textValue(general, "Sector"), industry: textValue(general, "Industry"), description: textValue(general, "Description"), employees: numericValue(general, "FullTimeEmployees"), website: textValue(general, "WebURL"), source: "eodhd" };
    return providerResult(this.name, data, { freshness: "cached", freshnessType: "END_OF_DAY" });
  }

  async getFundamentals(symbol: string) {
    const raw = await fundamentals(symbol); const highlights = objectValue(raw.Highlights); const valuation = objectValue(raw.Valuation); const shares = objectValue(raw.SharesStats); const technicals = objectValue(raw.Technicals);
    const data: MarketFundamentalsDto = { symbol, marketCap: numericValue(highlights, "MarketCapitalization"), enterpriseValue: numericValue(valuation, "EnterpriseValue"), trailingEps: numericValue(highlights, "EarningsShare"), trailingPe: numericValue(highlights, "PERatio", "TrailingPE"), forwardPe: numericValue(highlights, "ForwardPE"), priceToBook: numericValue(valuation, "PriceBookMRQ"), dividendRate: numericValue(highlights, "DividendShare"), dividendYield: numericValue(highlights, "DividendYield"), returnOnEquity: numericValue(highlights, "ReturnOnEquityTTM"), debtToEquity: numericValue(highlights, "DebtToEquityMRQ"), profitMargins: numericValue(highlights, "ProfitMargin"), revenue: numericValue(highlights, "RevenueTTM"), freeCashflow: numericValue(highlights, "FreeCashFlow"), sharesOutstanding: numericValue(shares, "SharesOutstanding"), source: "eodhd" };
    if (data.marketCap === null && numericValue(technicals, "Beta") === null) throw new ProviderError(this.name, "NOT_FOUND", "Fondamentali EODHD non disponibili.", false, 404);
    return providerResult(this.name, data, { freshness: "cached", freshnessType: "END_OF_DAY", quality: "verified" });
  }

  async getStatements(symbol: string, kind: StatementKind, period: StatementPeriod, limit = 5) {
    const raw = await fundamentals(symbol); const rows = rowsFromSection(raw, kind, period);
    const data = Object.entries(rows).slice(0, Math.max(1, limit)).flatMap(([dateKey, value]): FinancialStatement[] => {
      const row = objectValue(value); const fiscalDate = textValue(row, "date") ?? dateKey;
      return fiscalDate ? [{ symbol, kind, period, fiscalDate, reportedCurrency: textValue(row, "currency_symbol"), acceptedAt: textValue(row, "filing_date"), values: values(row) }] : [];
    });
    if (!data.length) throw new ProviderError(this.name, "NOT_FOUND", "Bilanci EODHD non disponibili.", false, 404);
    return providerResult(this.name, data, { sourceTimestamp: data[0]?.acceptedAt ?? data[0]?.fiscalDate ?? null, freshness: "cached", freshnessType: "END_OF_DAY" });
  }

  async getRatios(symbol: string, period: StatementPeriod, limit = 5) {
    const raw = await fundamentals(symbol); const sections = [objectValue(raw.Highlights), objectValue(raw.Valuation), objectValue(raw.Technicals), objectValue(raw.SharesStats)];
    const merged = Object.assign({}, ...sections); const data: FundamentalRatios[] = [{ symbol, period, date: textValue(objectValue(raw.General), "UpdatedAt"), values: values(merged) }].slice(0, limit);
    return providerResult(this.name, data, { sourceTimestamp: data[0]?.date ?? null, freshness: "cached", freshnessType: "END_OF_DAY" });
  }

  async getAnalystConsensus(symbol: string) {
    const raw = await fundamentals(symbol); const analyst = objectValue(raw.AnalystRatings);
    const data: AnalystConsensus = { symbol, targetLow: numericValue(analyst, "TargetPriceLow"), targetHigh: numericValue(analyst, "TargetPriceHigh"), targetMedian: numericValue(analyst, "TargetPriceMedian"), targetConsensus: numericValue(analyst, "TargetPrice"), analystCount: numericValue(analyst, "RatingCount"), currency: textValue(objectValue(raw.General), "CurrencyCode"), asOf: textValue(objectValue(raw.General), "UpdatedAt") };
    if (data.targetConsensus === null) throw new ProviderError(this.name, "NOT_FOUND", "Consensus EODHD non disponibile.", false, 404);
    return providerResult(this.name, data, { sourceTimestamp: data.asOf, freshness: "cached", freshnessType: "END_OF_DAY" });
  }

  async getEarningsCalendar(): Promise<ProviderResult<EarningsEvent[]>> { throw new ProviderError(this.name, "PLAN_RESTRICTED", "Calendario EODHD non abilitato.", false, 501); }
  async getDividendCalendar(): Promise<never> { throw new ProviderError(this.name, "PLAN_RESTRICTED", "Eventi dividendo EODHD non abilitati; i conteggi aggregati non sono trattati come pagamenti.", false, 501); }
  async getEconomicCalendar(): Promise<ProviderResult<EconomicEvent[]>> { throw new ProviderError(this.name, "PLAN_RESTRICTED", "Calendario macro EODHD non abilitato.", false, 501); }
}
