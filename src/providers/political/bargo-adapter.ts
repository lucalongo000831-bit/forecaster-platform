import "server-only";

import { z } from "zod";
import { safeExternalHttpsUrl } from "@/lib/safe-url";
import { normalizePoliticalTransactionType, stablePoliticalId } from "@/engines/political";
import { providerGatewayV2 } from "@/providers/gateway-v2";
import { officialJson } from "@/providers/data-v2/http";
import { providerResult } from "@/providers/metadata";
import type { PoliticalDisclosure, PoliticalProvider } from "@/providers/types";

const BASE = "https://www.bargo.ai/free-apis/congress/v1";
const rowSchema = z.object({
  member: z.string().min(1), member_slug: z.string().nullable().optional(), chamber: z.string(), state: z.string().nullable().optional(),
  ticker: z.string().nullable().optional(), asset: z.string().min(1), type: z.string(), amount_low: z.number().nullable().optional(),
  amount_high: z.number().nullable().optional(), amount_range: z.string().nullable().optional(), transaction_date: z.string(), disclosure_date: z.string(),
  filing_portal: z.string().nullable().optional(),
}).passthrough();
const pageSchema = z.object({ trades: z.array(rowSchema), page: z.number(), limit: z.number(), count: z.number() });
const healthSchema = z.object({ status: z.string(), trades: z.number().optional(), latest_disclosure: z.string().nullable().optional(), note: z.string().optional() }).passthrough();

export type BargoTrade = z.infer<typeof rowSchema>;
export interface BargoQuery { page?: number; limit?: number; ticker?: string; member?: string; chamber?: "house" | "senate"; type?: string; from?: string; to?: string; }

function amountRange(row: BargoTrade) {
  if (row.amount_range) return row.amount_range;
  if (row.amount_low == null && row.amount_high == null) return null;
  return `$${(row.amount_low ?? row.amount_high ?? 0).toLocaleString("en-US")} - $${(row.amount_high ?? row.amount_low ?? 0).toLocaleString("en-US")}`;
}
export function mapBargoTrade(row: BargoTrade): PoliticalDisclosure | null {
  const transactionDate = row.transaction_date.slice(0, 10); const disclosureDate = row.disclosure_date.slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(transactionDate) || !/^\d{4}-\d{2}-\d{2}$/.test(disclosureDate)) return null;
  const sourceId = stablePoliticalId("bargo", row.member_slug ?? row.member, row.ticker, transactionDate, disclosureDate, row.type, amountRange(row));
  return { id: `bargo-${sourceId}`, sourceId, politician: row.member, chamber: row.chamber.toUpperCase() === "HOUSE" ? "HOUSE" : row.chamber.toUpperCase() === "SENATE" ? "SENATE" : "UNKNOWN", party: null, state: row.state ?? null, district: null, symbol: row.ticker?.trim().toUpperCase() || null, asset: row.asset, assetType: null, transactionType: normalizePoliticalTransactionType(row.type), rawTransactionType: row.type, transactionDate, disclosureDate, amountRange: amountRange(row), ownership: null, capitalGains: null, sourceUrl: safeExternalHttpsUrl(row.filing_portal), filingId: null, filingType: "PTR", amendment: false, provider: "bargo", sourceLabel: "Bargo Congress API (secondary source)" };
}

export class BargoCongressAdapter implements PoliticalProvider {
  readonly name = "bargo" as const;
  isConfigured() { return true; }

  private async page(query: BargoQuery = {}) {
    const url = new URL(`${BASE}/trades`);
    const parameters = { ...query, page: Math.max(0, Math.floor(query.page ?? 0)), limit: Math.min(100, Math.max(1, Math.floor(query.limit ?? 100))) };
    for (const [key, value] of Object.entries(parameters)) if (value !== undefined && value !== "") url.searchParams.set(key, String(value));
    return providerGatewayV2.execute({ provider: this.name, dataset: "political_disclosures", operation: "trades", priority: "BACKGROUND", requestKey: url.searchParams.toString(), schema: pageSchema, task: () => officialJson(url), cache: { freshSeconds: 3_600, staleSeconds: 21_600 }, retryCount: 1, requestMetadata: { url } });
  }

  async getTrades(query: BargoQuery = {}) { return this.page(query); }
  getTradesByTicker(ticker: string, query: Omit<BargoQuery, "ticker"> = {}) { return this.page({ ...query, ticker: ticker.trim().toUpperCase() }); }
  getTradesByDateRange(from: string, to: string, query: Omit<BargoQuery, "from" | "to"> = {}) { return this.page({ ...query, from, to }); }
  async *iteratePages(query: BargoQuery = {}, maxPages = 100) {
    let page = Math.max(0, query.page ?? 0);
    for (let index = 0; index < maxPages; index += 1) { const response = await this.page({ ...query, page }); yield response; if (!response.data.trades.length || response.data.trades.length < response.data.limit) break; page += 1; }
  }
  healthCheck() { return providerGatewayV2.execute({ provider: this.name, dataset: "political_disclosures", operation: "health", priority: "NORMAL", requestKey: "health", schema: healthSchema, task: () => officialJson(new URL(`${BASE}/health`)), cache: { freshSeconds: 300, staleSeconds: 1_800 }, retryCount: 0, requestMetadata: { url: `${BASE}/health` } }); }

  private async request(chamber: "HOUSE" | "SENATE", symbol?: string, limit = 100) { const response = await this.page({ chamber: chamber.toLowerCase() as "house" | "senate", ticker: symbol, limit }); const data = response.data.trades.flatMap((row) => { const mapped = mapBargoTrade(row); return mapped ? [mapped] : []; }); return providerResult(this.name, data, { sourceTimestamp: data.map((item) => item.disclosureDate).filter(Boolean).sort().at(-1) ?? null, freshness: "cached", freshnessType: "CACHED", quality: data.length ? "partial" : "unavailable", isFallback: response.isFallback }); }
  getSenateTrades(symbol?: string, limit?: number) { return this.request("SENATE", symbol, limit); }
  getHouseTrades(symbol?: string, limit?: number) { return this.request("HOUSE", symbol, limit); }
}
