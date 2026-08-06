import "server-only";

import { getServerEnvironment } from "@/schemas/env";
import { yahooFinanceClient } from "@/services/yahoo/yahoo-finance-client";
import { normalizeSymbol } from "@/services/yahoo/symbol-resolver";
import { ProviderError } from "../errors";
import { providerResult } from "../metadata";
import type { FundamentalsProvider, StatementKind, StatementPeriod } from "../types";

export class YahooFundamentalsAdapter implements FundamentalsProvider {
  readonly name = "yahoo" as const;

  isConfigured() { return getServerEnvironment().YAHOO_FINANCE_ENABLED; }
  supportsSymbol(symbol: string) {
    try { normalizeSymbol(symbol); return !symbol.startsWith("^") && !symbol.includes("="); }
    catch { return false; }
  }
  async getCompanyProfile(symbol: string) {
    return providerResult(this.name, await yahooFinanceClient.profile(symbol), { freshness: "cached" });
  }
  async getFundamentals(symbol: string) {
    return providerResult(this.name, await yahooFinanceClient.fundamentals(symbol), { freshness: "cached", quality: "partial" });
  }
  async getStatements(_symbol: string, _kind: StatementKind, _period: StatementPeriod, _limit = 5): Promise<never> {
    void [_symbol, _kind, _period, _limit];
    throw new ProviderError(this.name, "PLAN_RESTRICTED", "Bilanci storici non esposti dall'adapter Yahoo.", false, 501);
  }
  async getRatios(_symbol: string, _period: StatementPeriod, _limit = 5): Promise<never> {
    void [_symbol, _period, _limit];
    throw new ProviderError(this.name, "PLAN_RESTRICTED", "Serie storiche dei ratio non esposte dall'adapter Yahoo.", false, 501);
  }
  async getAnalystConsensus(_symbol: string): Promise<never> {
    void _symbol;
    throw new ProviderError(this.name, "PLAN_RESTRICTED", "Consensus analisti non esposto dall'adapter Yahoo.", false, 501);
  }
  async getEarningsCalendar(_from: string, _to: string, _symbol?: string): Promise<never> {
    void [_from, _to, _symbol];
    throw new ProviderError(this.name, "PLAN_RESTRICTED", "Calendario earnings non esposto dall'adapter Yahoo.", false, 501);
  }
  async getDividendCalendar(_from: string, _to: string, _symbol?: string): Promise<never> {
    void [_from, _to, _symbol];
    throw new ProviderError(this.name, "PLAN_RESTRICTED", "Calendario dividendi non esposto dall'adapter Yahoo.", false, 501);
  }
  async getEconomicCalendar(_from: string, _to: string): Promise<never> {
    void [_from, _to];
    throw new ProviderError(this.name, "PLAN_RESTRICTED", "Calendario macro non esposto dall'adapter Yahoo.", false, 501);
  }
}
