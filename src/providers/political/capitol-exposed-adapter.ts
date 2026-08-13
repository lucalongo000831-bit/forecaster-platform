import "server-only";

import { z } from "zod";
import { safeExternalHttpsUrl } from "@/lib/safe-url";
import { normalizePoliticalTransactionType } from "@/engines/political";
import { providerGatewayV2 } from "@/providers/gateway-v2";
import { officialJson } from "@/providers/data-v2/http";
import type { PoliticalDisclosure } from "@/providers/types";

const BASE = "https://www.capitolexposed.com/api/v1";
const rowSchema = z.object({ id: z.string(), member_id: z.string().nullable().optional(), member_name: z.string(), member_slug: z.string().nullable().optional(), ticker: z.string().nullable().optional(), asset_description: z.string(), transaction_type: z.string(), transaction_date: z.string(), disclosure_date: z.string().nullable().optional(), amount_min: z.union([z.string(), z.number()]).nullable().optional(), amount_max: z.union([z.string(), z.number()]).nullable().optional(), owner: z.string().nullable().optional(), source_url: z.string().nullable().optional() }).passthrough();
const pageSchema = z.object({ status: z.string(), data: z.array(rowSchema), meta: z.object({ total: z.number(), page: z.number(), per_page: z.number(), has_more: z.boolean() }).passthrough(), citation: z.object({ url: z.string().optional(), license: z.string().optional() }).passthrough().optional() }).passthrough();
const memberSchema = z.object({ id: z.string(), name: z.string(), party: z.string().nullable().optional(), state: z.string().nullable().optional(), district: z.union([z.string(), z.number()]).nullable().optional(), chamber: z.string().nullable().optional() }).passthrough();
const membersSchema = z.object({ data: z.array(memberSchema), meta: z.object({ has_more: z.boolean().optional(), page: z.number().optional(), total: z.number().optional(), per_page: z.number().optional() }).passthrough() }).passthrough();

export type CapitolExposedTrade = z.infer<typeof rowSchema>;
export interface CapitolExposedMember { id: string; name: string; party: string | null; state: string | null; district: string | null; chamber: "HOUSE" | "SENATE" | "UNKNOWN"; }

function range(row: CapitolExposedTrade) { const low = Number(row.amount_min); const high = Number(row.amount_max); return Number.isFinite(low) && Number.isFinite(high) ? `$${low.toLocaleString("en-US")} - $${high.toLocaleString("en-US")}` : null; }
export function mapCapitolExposedTrade(row: CapitolExposedTrade, member?: CapitolExposedMember): PoliticalDisclosure | null {
  const transactionDate = row.transaction_date.slice(0, 10); const disclosureDate = row.disclosure_date?.slice(0, 10) ?? transactionDate;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(transactionDate) || !/^\d{4}-\d{2}-\d{2}$/.test(disclosureDate)) return null;
  const idChamber = row.id.includes("-house-") ? "HOUSE" : row.id.includes("-senate-") ? "SENATE" : "UNKNOWN";
  return { id: `capitol-exposed-${row.id}`, sourceId: row.id, politician: row.member_name, chamber: member?.chamber ?? idChamber, party: member?.party ?? null, state: member?.state ?? null, district: member?.district ?? null, symbol: row.ticker?.trim().toUpperCase() || null, asset: row.asset_description, assetType: null, transactionType: normalizePoliticalTransactionType(row.transaction_type), rawTransactionType: row.transaction_type, transactionDate, disclosureDate, amountRange: range(row), ownership: row.owner ?? null, capitalGains: null, sourceUrl: safeExternalHttpsUrl(row.source_url), filingId: row.id.split("-").slice(0, -1).join("-"), filingType: "PTR", amendment: false, provider: "capitol-exposed", sourceLabel: "CapitolExposed Congress API (secondary historical source)" };
}

export class CapitolExposedCongressAdapter {
  readonly name = "capitol-exposed" as const;
  private lastRequestAt = 0;
  isConfigured() { return true; }
  private async throttle() { const wait = Math.max(0, 1_100 - (Date.now() - this.lastRequestAt)); if (wait) await new Promise((resolve) => setTimeout(resolve, wait)); this.lastRequestAt = Date.now(); }
  async getMembers() { const members = new Map<string, CapitolExposedMember>(); for (let page = 1; page <= 10; page += 1) { await this.throttle(); const url = new URL(`${BASE}/members`); url.searchParams.set("per_page", "100"); url.searchParams.set("page", String(page)); const response = await providerGatewayV2.execute({ provider: this.name, dataset: "political_members", operation: "members", priority: "BACKGROUND", requestKey: `page:${page}`, schema: membersSchema, task: () => officialJson(url), cache: { freshSeconds: 86_400, staleSeconds: 604_800 }, retryCount: 1, requestMetadata: { url } }); for (const row of response.data.data) members.set(row.id, { id: row.id, name: row.name, party: row.party ?? null, state: row.state ?? null, district: row.district == null ? null : String(row.district), chamber: row.chamber?.toUpperCase() === "HOUSE" ? "HOUSE" : row.chamber?.toUpperCase() === "SENATE" ? "SENATE" : "UNKNOWN" }); if (!response.data.meta.has_more || response.data.data.length < 100) break; } return members; }
  async getPage(page = 1, pageSize = 100, filters: { ticker?: string; type?: string; party?: string } = {}) { await this.throttle(); const url = new URL(`${BASE}/trades`); url.searchParams.set("page", String(Math.max(1, Math.floor(page)))); url.searchParams.set("per_page", String(Math.min(100, Math.max(1, Math.floor(pageSize))))); for (const [key, value] of Object.entries(filters)) if (value) url.searchParams.set(key, value); return providerGatewayV2.execute({ provider: this.name, dataset: "political_disclosures", operation: "trades", priority: "BACKGROUND", requestKey: url.searchParams.toString(), schema: pageSchema, task: () => officialJson(url), cache: { freshSeconds: 3_600, staleSeconds: 86_400 }, retryCount: 1, requestMetadata: { url } }); }
  async *iteratePages(options: { page?: number; pageSize?: number; maxPages?: number; filters?: { ticker?: string; type?: string; party?: string } } = {}) { let page = Math.max(1, options.page ?? 1); for (let index = 0; index < (options.maxPages ?? 500); index += 1) { const response = await this.getPage(page, options.pageSize ?? 100, options.filters); yield response; if (!response.data.meta.has_more || response.data.data.length === 0) break; page += 1; } }
  healthCheck() { const url = new URL(`${BASE}/stats`); return providerGatewayV2.execute({ provider: this.name, dataset: "political_disclosures", operation: "health", priority: "NORMAL", requestKey: "stats", schema: z.object({ status: z.string(), data: z.object({ trade_count: z.number() }).passthrough() }).passthrough(), task: () => officialJson(url), cache: { freshSeconds: 300, staleSeconds: 1_800 }, retryCount: 0, requestMetadata: { url } }); }
}
