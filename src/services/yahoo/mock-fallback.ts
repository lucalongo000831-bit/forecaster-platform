import "server-only";

import { mockFinancialDataset } from "@/data/mock";
import type {
  ChartRange,
  MarketChartDto,
  MarketFundamentalsDto,
  MarketNewsDto,
  MarketProfileDto,
  MarketQuoteDto,
  SearchInstrument,
} from "@/types";
import { normalizeSymbol } from "./symbol-resolver";

export function fallbackQuote(symbolInput: string): MarketQuoteDto {
  const symbol = normalizeSymbol(symbolInput);
  const item = mockFinancialDataset.instrument;
  return {
    symbol,
    name: symbol === item.symbol ? item.name : `${symbol} · modalità demo`,
    exchange: item.market,
    quoteType: "EQUITY",
    currency: item.currency,
    price: item.quote.price,
    change: item.quote.change,
    changePercent: item.quote.changePercent,
    open: item.quote.open ?? item.quote.previousClose ?? null,
    previousClose: item.quote.previousClose ?? null,
    dayLow: item.quote.dayLow,
    dayHigh: item.quote.dayHigh,
    volume: item.quote.volume,
    marketCap: null,
    marketState: "DEMO",
    asOf: null,
    isDelayed: true,
    source: "mock",
  };
}

export function fallbackChart(symbolInput: string, range: ChartRange): MarketChartDto {
  const symbol = normalizeSymbol(symbolInput);
  const source = mockFinancialDataset.overview.priceSeries;
  return {
    symbol,
    currency: mockFinancialDataset.instrument.currency,
    exchange: mockFinancialDataset.instrument.market,
    range,
    interval: range === "1D" ? "5m" : range === "5D" ? "15m" : range === "1M" ? "1h" : range === "5Y" ? "1wk" : range === "MAX" ? "1mo" : "1d",
    previousClose: null,
    isDelayed: true,
    asOf: null,
    points: source.map((point, index) => ({
      timestamp: new Date(Date.UTC(2021, index, 1)).toISOString(),
      open: point.value,
      high: point.value,
      low: point.value,
      close: point.value,
      adjustedClose: point.value,
      volume: point.volume ?? 0,
    })),
    source: "mock",
  };
}

export function fallbackSearch(): SearchInstrument[] {
  return mockFinancialDataset.searchUniverse.map((item) => ({ ...item, source: "mock" }));
}

export function fallbackProfile(symbolInput: string): MarketProfileDto {
  const symbol = normalizeSymbol(symbolInput);
  const item = mockFinancialDataset.instrument;
  return {
    symbol,
    name: symbol === item.symbol ? item.name : `${symbol} · modalità demo`,
    exchange: item.market,
    quoteType: "EQUITY",
    currency: item.currency,
    country: item.country,
    sector: item.sector,
    industry: item.category,
    description: "Profilo dimostrativo mostrato perché il provider Yahoo Finance non è raggiungibile.",
    employees: null,
    website: null,
    source: "mock",
  };
}

export function fallbackFundamentals(symbolInput: string): MarketFundamentalsDto {
  const symbol = normalizeSymbol(symbolInput);
  return {
    symbol,
    marketCap: null,
    enterpriseValue: null,
    trailingEps: null,
    trailingPe: null,
    forwardPe: null,
    priceToBook: null,
    dividendRate: null,
    dividendYield: null,
    returnOnEquity: null,
    debtToEquity: null,
    profitMargins: null,
    revenue: null,
    freeCashflow: null,
    sharesOutstanding: null,
    source: "mock",
  };
}

export function fallbackNews(): MarketNewsDto[] { return []; }
