import "server-only";

import { BargoCongressAdapter, mapBargoTrade } from "@/providers/political/bargo-adapter";
import { CapitolExposedCongressAdapter, mapCapitolExposedTrade } from "@/providers/political/capitol-exposed-adapter";
import { FmpPoliticalAdapter } from "@/providers/political/fmp-adapter";
import type { PoliticalDisclosure } from "@/providers/types";

export interface PoliticalSourceAttempt { provider: "fmp" | "bargo" | "capitol-exposed"; status: "OK" | "RATE_LIMIT" | "PLAN_LIMIT" | "ERROR"; records: number; }
export interface PoliticalSourceResult { rows: PoliticalDisclosure[]; attempts: PoliticalSourceAttempt[]; operational: boolean; degraded: boolean; fetchedAt: string; }
export type PoliticalHistoricalSource = "bargo" | "capitol-exposed";

function failureStatus(error: unknown): PoliticalSourceAttempt["status"] { const value = error instanceof Error ? error.message.toLowerCase() : ""; return value.includes("429") || value.includes("rate") ? "RATE_LIMIT" : value.includes("plan") || value.includes("403") ? "PLAN_LIMIT" : "ERROR"; }

export class PoliticalSourceRouter {
  constructor(private readonly fmp = new FmpPoliticalAdapter(), private readonly bargo = new BargoCongressAdapter(), private readonly historical = new CapitolExposedCongressAdapter()) {}

  async recent(options: { from: string; to: string; limit?: number; symbol?: string } ) {
    const attempts: PoliticalSourceAttempt[] = []; const rows: PoliticalDisclosure[] = []; const limit = options.limit ?? 100;
    for (const chamber of ["HOUSE", "SENATE"] as const) { try { const response = chamber === "HOUSE" ? await this.fmp.getHouseTrades(options.symbol, limit) : await this.fmp.getSenateTrades(options.symbol, limit); const accepted = response.data.filter((row) => (row.disclosureDate ?? row.transactionDate) >= options.from && (row.disclosureDate ?? row.transactionDate) <= options.to); rows.push(...accepted); attempts.push({ provider: "fmp", status: "OK", records: accepted.length }); } catch (error) { attempts.push({ provider: "fmp", status: failureStatus(error), records: 0 }); } }
    try { const response = options.symbol ? await this.bargo.getTradesByTicker(options.symbol, { from: options.from, to: options.to, limit }) : await this.bargo.getTradesByDateRange(options.from, options.to, { limit }); const accepted = response.data.trades.flatMap((row) => { const mapped = mapBargoTrade(row); return mapped ? [mapped] : []; }); rows.push(...accepted); attempts.push({ provider: "bargo", status: "OK", records: accepted.length }); } catch (error) { attempts.push({ provider: "bargo", status: failureStatus(error), records: 0 }); }
    const operational = attempts.some((item) => item.status === "OK"); return { rows, attempts, operational, degraded: operational && attempts.some((item) => item.status !== "OK"), fetchedAt: new Date().toISOString() } satisfies PoliticalSourceResult;
  }

  async historicalPage(source: PoliticalHistoricalSource, page: number, pageSize = 100, options: { from: string; to: string; chamber?: "HOUSE" | "SENATE"; members?: Awaited<ReturnType<CapitolExposedCongressAdapter["getMembers"]>> }) {
    if (source === "bargo") {
      const response = await this.bargo.getTradesByDateRange(options.from, options.to, { page, limit: pageSize, chamber: options.chamber?.toLowerCase() as "house" | "senate" | undefined });
      const rows = response.data.trades.flatMap((row) => { const mapped = mapBargoTrade(row); return mapped ? [mapped] : []; });
      return { rows, hasMore: response.data.trades.length >= response.data.limit, total: null, provider: "bargo" as const, fetchedAt: response.fetchedAt };
    }
    const lookup = options.members ?? await this.historical.getMembers(); const response = await this.historical.getPage(page, pageSize); const rows = response.data.data.flatMap((row) => { const mapped = mapCapitolExposedTrade(row, row.member_id ? lookup.get(row.member_id) : undefined); return mapped ? [mapped] : []; }); return { rows, hasMore: response.data.meta.has_more, total: response.data.meta.total, provider: "capitol-exposed" as const, fetchedAt: response.fetchedAt };
  }

  getHistoricalMembers(source: PoliticalHistoricalSource) { return source === "capitol-exposed" ? this.historical.getMembers() : Promise.resolve(new Map()); }
  health() { return Promise.allSettled([this.bargo.healthCheck(), this.historical.healthCheck()]); }
}

export const politicalSourceRouter = new PoliticalSourceRouter();
