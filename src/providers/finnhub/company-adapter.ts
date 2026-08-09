import "server-only";

import { normalizeSymbol } from "@/services/yahoo/symbol-resolver";
import type { EtfProfile } from "@/types";
import { ProviderError } from "../errors";
import { finnhubGet } from "./client";
import { arrayValue, numericValue, objectValue, textValue } from "../shared";

export interface FinnhubInsiderTransaction {
  name: string;
  share: number | null;
  change: number | null;
  filingDate: string | null;
  transactionDate: string | null;
  transactionCode: string | null;
  transactionPrice: number | null;
}

export class FinnhubCompanyAdapter {
  readonly name = "finnhub" as const;
  isConfigured() { return Boolean(process.env.FINNHUB_API_KEY); }

  async getProfile(symbolInput: string) {
    const symbol = normalizeSymbol(symbolInput);
    const row = objectValue(await finnhubGet("stock/profile2", { symbol }, "profile"));
    if (!textValue(row, "name", "ticker")) throw new ProviderError(this.name, "NOT_FOUND", "Profilo Finnhub non disponibile.", false, 404);
    return row;
  }

  async getPeers(symbolInput: string) {
    const symbol = normalizeSymbol(symbolInput);
    const data = arrayValue(await finnhubGet("stock/peers", { symbol }, "peers")).filter((value): value is string => typeof value === "string" && value.toUpperCase() !== symbol).map((value) => value.toUpperCase());
    if (!data.length) throw new ProviderError(this.name, "NOT_FOUND", "Peer Finnhub non disponibili.", false, 404);
    return [...new Set(data)].slice(0, 12);
  }

  async getBasicFinancials(symbolInput: string) {
    const symbol = normalizeSymbol(symbolInput);
    const row = objectValue(await finnhubGet("stock/metric", { symbol, metric: "all" }, "basic-financials"));
    const metric = objectValue(row.metric);
    if (!Object.keys(metric).length) throw new ProviderError(this.name, "NOT_FOUND", "Metriche Finnhub non disponibili.", false, 404);
    return { metric, series: objectValue(row.series) };
  }

  async getInsiderTransactions(symbolInput: string, from: string, to: string) {
    const symbol = normalizeSymbol(symbolInput);
    const raw = objectValue(await finnhubGet("stock/insider-transactions", { symbol, from, to }, "insider-transactions"));
    return arrayValue(raw.data).flatMap((value): FinnhubInsiderTransaction[] => {
      const row = objectValue(value); const name = textValue(row, "name");
      if (!name) return [];
      return [{ name, share: numericValue(row, "share"), change: numericValue(row, "change"), filingDate: textValue(row, "filingDate"), transactionDate: textValue(row, "transactionDate"), transactionCode: textValue(row, "transactionCode"), transactionPrice: numericValue(row, "transactionPrice") }];
    });
  }

  async getExecutives(symbolInput: string) {
    const symbol = normalizeSymbol(symbolInput);
    const raw = objectValue(await finnhubGet("stock/executive", { symbol }, "executives"));
    return arrayValue(raw.executive).flatMap((value) => {
      const row = objectValue(value); const name = textValue(row, "name");
      return name ? [{ name, title: textValue(row, "position", "title"), since: textValue(row, "since"), compensation: numericValue(row, "compensation") }] : [];
    });
  }

  async getEtfProfile(symbolInput: string): Promise<EtfProfile> {
    const symbol = normalizeSymbol(symbolInput);
    const [profileRaw, holdingsRaw] = await Promise.all([
      finnhubGet("etf/profile", { symbol }, "etf-profile"),
      finnhubGet("etf/holdings", { symbol }, "etf-holdings").catch(() => ({})),
    ]);
    const profile = objectValue(profileRaw); const holdings = objectValue(holdingsRaw);
    if (!Object.keys(profile).length) throw new ProviderError(this.name, "NOT_FOUND", "Profilo ETF Finnhub non disponibile.", false, 404);
    return {
      symbol,
      name: textValue(profile, "name") ?? symbol,
      issuer: textValue(profile, "issuer"),
      category: textValue(profile, "category"),
      domicile: textValue(profile, "domicile"),
      inceptionDate: textValue(profile, "inceptionDate"),
      expenseRatio: numericValue(profile, "expenseRatio"),
      assetsUnderManagement: numericValue(profile, "aum"),
      nav: numericValue(profile, "nav"),
      holdings: arrayValue(holdings.holding ?? holdings.data).flatMap((value) => { const row = objectValue(value); const name = textValue(row, "name"); return name ? [{ symbol: textValue(row, "symbol"), name, weight: numericValue(row, "percent", "weight"), country: null, sector: null }] : []; }),
      sectorAllocation: arrayValue(profile.sectorExposure).flatMap((value) => { const row = objectValue(value); const name = textValue(row, "sector"); const weight = numericValue(row, "weight"); return name && weight !== null ? [{ name, weight }] : []; }),
      countryAllocation: arrayValue(profile.countryExposure).flatMap((value) => { const row = objectValue(value); const name = textValue(row, "country"); const weight = numericValue(row, "weight"); return name && weight !== null ? [{ name, weight }] : []; }),
    };
  }
}

export const finnhubCompanyAdapter = new FinnhubCompanyAdapter();
