import "server-only";

import { z } from "zod";
import { providerGatewayV2 } from "@/providers/gateway-v2";
import { getKairoDataV2ProviderConfigs } from "@/providers/kairo-data-v2/config";
import { officialJson } from "./http";

const openFigiResultSchema = z.array(z.object({
  data: z.array(z.object({ figi: z.string(), name: z.string().optional(), ticker: z.string().optional(), exchCode: z.string().optional(), compositeFIGI: z.string().optional(), securityType: z.string().optional(), marketSector: z.string().optional() }).passthrough()).optional(),
  error: z.string().optional(), warning: z.string().optional(),
}).passthrough());

const gleifSchema = z.object({ data: z.array(z.object({ type: z.string(), id: z.string(), attributes: z.record(z.string(), z.unknown()) }).passthrough()), meta: z.record(z.string(), z.unknown()).optional() }).passthrough();

export class OpenFigiAdapter {
  async map(idType: string, idValue: string, exchangeCode?: string) {
    if (!/^[A-Z0-9_]{2,40}$/.test(idType) || !/^[A-Za-z0-9.^=_:-]{1,80}$/.test(idValue)) throw new Error("Invalid OpenFIGI mapping input");
    const config = getKairoDataV2ProviderConfigs().openfigi; if (!config.apiKey) throw new Error("OpenFIGI is not configured");
    const url = new URL("/v3/mapping", config.baseUrl); const body = [{ idType, idValue, ...(exchangeCode ? { exchCode: exchangeCode } : {}) }];
    return providerGatewayV2.execute({ provider: "openfigi", dataset: "instrument_identity", operation: "mapping", requestKey: JSON.stringify(body), schema: openFigiResultSchema, task: () => officialJson(url, { method: "POST", headers: { "content-type": "application/json", "X-OPENFIGI-APIKEY": config.apiKey! }, body: JSON.stringify(body) }, config.timeoutMs), cache: { freshSeconds: 2_592_000, staleSeconds: 15_552_000 }, requestMetadata: { url, headers: { "X-OPENFIGI-APIKEY": config.apiKey }, body } });
  }
}

export class GleifAdapter {
  async searchLegalName(name: string, countryCode?: string) {
    const normalized = name.trim(); if (normalized.length < 2 || normalized.length > 220) throw new Error("Invalid legal name");
    const url = new URL("https://api.gleif.org/api/v1/lei-records"); url.searchParams.set("filter[entity.legalName]", normalized); url.searchParams.set("page[size]", "10");
    if (countryCode && /^[A-Z]{2}$/.test(countryCode)) url.searchParams.set("filter[entity.legalAddress.country]", countryCode);
    return providerGatewayV2.execute({ provider: "gleif", dataset: "issuer_identity", operation: "legal_name_search", requestKey: `${normalized}:${countryCode ?? ""}`, schema: gleifSchema, task: () => officialJson(url), cache: { freshSeconds: 604_800, staleSeconds: 7_776_000 }, requestMetadata: { url } });
  }

  async byLei(lei: string) {
    if (!/^[A-Z0-9]{20}$/.test(lei)) throw new Error("Invalid LEI"); const url = new URL(`https://api.gleif.org/api/v1/lei-records/${lei}`);
    const schema = z.object({ data: z.object({ type: z.string(), id: z.string(), attributes: z.record(z.string(), z.unknown()) }).passthrough() }).passthrough();
    return providerGatewayV2.execute({ provider: "gleif", dataset: "issuer_identity", operation: "lei_record", requestKey: lei, schema, task: () => officialJson(url), cache: { freshSeconds: 604_800, staleSeconds: 7_776_000 }, requestMetadata: { url } });
  }
}

export const openFigiAdapter = new OpenFigiAdapter();
export const gleifAdapter = new GleifAdapter();
