import "server-only";

import { z } from "zod";
import { providerGatewayV2 } from "@/providers/gateway-v2";
import { getKairoDataV2ProviderConfigs } from "@/providers/kairo-data-v2/config";
import { officialJson } from "./http";

const cftcSchema = z.array(z.record(z.string(), z.unknown()));
const marketauxArticleSchema = z.object({
  uuid: z.string(), title: z.string(), description: z.string().nullable().optional(), url: z.url(), image_url: z.url().nullable().optional(), language: z.string().nullable().optional(), published_at: z.string(), source: z.string().nullable().optional(),
  entities: z.array(z.object({ symbol: z.string().nullable().optional(), name: z.string().nullable().optional(), exchange: z.string().nullable().optional(), exchange_long: z.string().nullable().optional(), country: z.string().nullable().optional(), type: z.string().nullable().optional(), industry: z.string().nullable().optional(), match_score: z.number().nullable().optional(), sentiment_score: z.number().nullable().optional() }).passthrough()).default([]),
  similar: z.array(z.unknown()).optional(), snippet: z.string().nullable().optional(),
}).passthrough();
const marketauxSchema = z.object({ data: z.array(marketauxArticleSchema), meta: z.record(z.string(), z.unknown()).optional() }).passthrough();

export const cftcDatasetRegistry = {
  disaggregatedFuturesOnly: "72hh-3qpy",
  tradersInFinancialFuturesOnly: "gpe5-46if",
  legacyFuturesOnly: "6dca-aqww",
} as const;

export class CftcAdapter {
  async latest(dataset: keyof typeof cftcDatasetRegistry, limit = 500) {
    const datasetId = cftcDatasetRegistry[dataset]; const url = new URL(`https://publicreporting.cftc.gov/resource/${datasetId}.json`);
    url.searchParams.set("$limit", String(Math.min(Math.max(limit, 1), 5_000))); url.searchParams.set("$order", "report_date_as_yyyy_mm_dd DESC");
    return providerGatewayV2.execute({ provider: "cftc", dataset: "positioning", operation: dataset, requestKey: String(limit), schema: cftcSchema, task: () => officialJson(url), cache: { freshSeconds: 21_600, staleSeconds: 1_209_600 }, requestMetadata: { url } });
  }
}

export class MarketauxAdapter {
  async news(input: { symbols?: string[]; industries?: string[]; search?: string; limit?: number } = {}) {
    const config = getKairoDataV2ProviderConfigs().marketaux; if (!config.apiToken) throw new Error("Marketaux is not configured");
    const url = new URL("/v1/news/all", config.baseUrl); url.searchParams.set("api_token", config.apiToken); url.searchParams.set("language", "en"); url.searchParams.set("limit", String(Math.min(Math.max(input.limit ?? 50, 1), 100)));
    if (input.symbols?.length) url.searchParams.set("symbols", input.symbols.slice(0, 20).join(",")); if (input.industries?.length) url.searchParams.set("industries", input.industries.slice(0, 10).join(",")); if (input.search) url.searchParams.set("search", input.search.slice(0, 160));
    return providerGatewayV2.execute({ provider: "marketaux", dataset: "news", operation: "search", requestKey: JSON.stringify(input), schema: marketauxSchema, task: () => officialJson(url, {}, config.timeoutMs), cache: { freshSeconds: 900, staleSeconds: 21_600 }, requestMetadata: { url } });
  }
}

export interface OfficialPoliticalAvailability { chamber: "HOUSE" | "SENATE"; status: "AVAILABLE" | "UNSUPPORTED"; reason: string; }

export class OfficialPoliticalDisclosureAdapter {
  availability(): OfficialPoliticalAvailability[] {
    return [
      { chamber: "HOUSE", status: "AVAILABLE", reason: "Official Clerk bulk files can be ingested by scheduled document jobs; PDFs require deterministic extraction and verification." },
      { chamber: "SENATE", status: "UNSUPPORTED", reason: "No stable official public API is available. KAIRO does not bypass anti-bot protections." },
    ];
  }

  houseBulkUrl(year: number) {
    const current = new Date().getUTCFullYear(); if (!Number.isInteger(year) || year < 2012 || year > current) throw new Error("Invalid House disclosure year");
    return new URL(`${year}FD.zip`, "https://disclosures-clerk.house.gov/public_disc/financial-pdfs/");
  }
}

export const cftcAdapter = new CftcAdapter();
export const marketauxAdapter = new MarketauxAdapter();
export const officialPoliticalDisclosureAdapter = new OfficialPoliticalDisclosureAdapter();
