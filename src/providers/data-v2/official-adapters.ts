import "server-only";

import { z } from "zod";
import { providerGatewayV2, type GatewayResult } from "@/providers/gateway-v2";
import { getKairoDataV2ProviderConfigs } from "@/providers/kairo-data-v2/config";
import { officialJson, officialText } from "./http";

const fredObservationSchema = z.object({ date: z.string(), value: z.string(), realtime_start: z.string().optional(), realtime_end: z.string().optional() }).passthrough();
const fredSchema = z.object({ observations: z.array(fredObservationSchema) }).passthrough();
const blsSchema = z.object({ status: z.string(), Results: z.object({ series: z.array(z.object({ seriesID: z.string(), data: z.array(z.object({ year: z.string(), period: z.string(), periodName: z.string().optional(), value: z.string(), footnotes: z.array(z.unknown()).optional() }).passthrough()) }).passthrough()) }).passthrough() }).passthrough();
const beaSchema = z.object({ BEAAPI: z.object({ Results: z.unknown() }).passthrough() }).passthrough();
const eiaSchema = z.object({ response: z.object({ data: z.array(z.record(z.string(), z.unknown())).default([]) }).passthrough() }).passthrough();
const treasurySchema = z.object({ data: z.array(z.record(z.string(), z.unknown())).default([]), meta: z.record(z.string(), z.unknown()).optional() }).passthrough();
const ecbSchema = z.record(z.string(), z.unknown());
const eurostatSchema = z.object({ value: z.record(z.string(), z.number().nullable()).optional(), dimension: z.record(z.string(), z.unknown()).optional(), id: z.array(z.string()).optional(), size: z.array(z.number()).optional() }).passthrough();
const officialDocumentSchema = z.string().min(200);

export interface OfficialCentralBankMeeting {
  centralBank: "FEDERAL_RESERVE" | "ECB";
  country: "US" | "EU";
  meetingStart: string;
  decisionDate: string;
  decisionTime: string | null;
  timezone: "America/New_York" | "Europe/Frankfurt";
  eventType: "MONETARY_POLICY_MEETING" | "RATE_DECISION";
  title: string;
  sourceUrl: string;
  publishedAt: string | null;
  status: "SCHEDULED";
}

const monthNumbers: Record<string, number> = { january: 1, february: 2, march: 3, april: 4, may: 5, june: 6, july: 7, august: 8, september: 9, october: 10, november: 11, december: 12 };
const decode = (value: string) => value.replace(/<[^>]+>/g, " ").replace(/&(?:nbsp|#160);/gi, " ").replace(/&amp;/gi, "&").replace(/\s+/g, " ").trim();
const isoDate = (year: number, month: number, day: number) => `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
function zonedTime(date: string, hour: number, minute: number, timeZone: string) {
  const candidate = Date.parse(`${date}T${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}:00Z`);
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).formatToParts(candidate);
  const value = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  const represented = Date.parse(`${value.year}-${value.month}-${value.day}T${value.hour}:${value.minute}:00Z`);
  return new Date(candidate + (candidate - represented)).toISOString();
}

export function parseFederalReserveMeetings(html: string, sourceUrl: string): OfficialCentralBankMeeting[] {
  const publishedAt = /Last Update:\s*([^<]+)/i.exec(html)?.[1]?.trim() ?? null;
  const meetings: OfficialCentralBankMeeting[] = [];
  const sections = [...html.matchAll(/<a id="\d+">(20\d{2}) FOMC Meetings<\/a>[\s\S]*?(?=<a id="\d+">20\d{2} FOMC Meetings<\/a>|Future Year:|<\/main>)/gi)];
  for (const section of sections) {
    const year = Number(section[1]);
    const rows = section[0].matchAll(/<div class="[^"]*fomc-meeting[^"]*"[^>]*>[\s\S]*?fomc-meeting__month[^>]*>\s*<strong>([^<]+)<\/strong>[\s\S]*?fomc-meeting__date[^>]*>([^<]+)<\/div>/gi);
    for (const row of rows) {
      const month = monthNumbers[decode(row[1]!).toLowerCase().split("/")[0]!];
      const days = decode(row[2]!).replace(/\*/g, "").match(/\d+/g)?.map(Number) ?? [];
      if (!month || !days.length) continue;
      const startMonth = month;
      const decisionMonth = days.length > 1 && days.at(-1)! < days[0]! ? month + 1 : month;
      const meetingStart = isoDate(year, startMonth, days[0]!);
      const decisionDate = isoDate(decisionMonth > 12 ? year + 1 : year, decisionMonth > 12 ? 1 : decisionMonth, days.at(-1)!);
      meetings.push({ centralBank: "FEDERAL_RESERVE", country: "US", meetingStart, decisionDate, decisionTime: zonedTime(decisionDate, 14, 0, "America/New_York"), timezone: "America/New_York", eventType: "RATE_DECISION", title: "Federal Reserve FOMC monetary policy decision", sourceUrl, publishedAt, status: "SCHEDULED" });
    }
  }
  return meetings;
}

export function parseEcbMeetings(html: string, sourceUrl: string): OfficialCentralBankMeeting[] {
  const publishedAt = /article:published_time"\s+content="([^"]+)/i.exec(html)?.[1] ?? null;
  const rows = html.matchAll(/<dt>\s*(\d{2})\/(\d{2})\/(20\d{2})\s*<\/dt>\s*<dd[^>]*>([\s\S]*?)<\/dd>/gi);
  return [...rows].flatMap((row) => {
    const title = decode(row[4]!);
    if (!/monetary policy meeting/i.test(title) || !/Day 2|followed by press conference/i.test(title)) return [];
    const decisionDate = isoDate(Number(row[3]), Number(row[2]), Number(row[1]));
    const previousDay = new Date(`${decisionDate}T00:00:00Z`); previousDay.setUTCDate(previousDay.getUTCDate() - 1);
    return [{ centralBank: "ECB" as const, country: "EU" as const, meetingStart: previousDay.toISOString().slice(0, 10), decisionDate, decisionTime: zonedTime(decisionDate, 14, 15, "Europe/Berlin"), timezone: "Europe/Frankfurt" as const, eventType: "RATE_DECISION" as const, title: "ECB Governing Council monetary policy decision", sourceUrl, publishedAt, status: "SCHEDULED" as const }];
  });
}

export class OfficialCentralBankCalendarAdapter {
  private readonly fedUrl = new URL("https://www.federalreserve.gov/monetarypolicy/fomccalendars.htm");
  private readonly ecbUrl = new URL("https://www.ecb.europa.eu/press/calendars/mgcgc/html/index.en.html");

  async federalReserve() {
    return providerGatewayV2.execute({ provider: "federal-reserve", dataset: "central_bank_calendar", operation: "fomc_calendar", requestKey: "official", schema: officialDocumentSchema, task: () => officialText(this.fedUrl), cache: { freshSeconds: 21_600, staleSeconds: 604_800 }, requestMetadata: { url: this.fedUrl } });
  }

  async ecb() {
    return providerGatewayV2.execute({ provider: "ecb", dataset: "central_bank_calendar", operation: "governing_council_calendar", requestKey: "official", schema: officialDocumentSchema, task: () => officialText(this.ecbUrl), cache: { freshSeconds: 21_600, staleSeconds: 604_800 }, requestMetadata: { url: this.ecbUrl } });
  }
}

function requireValue(value: string | undefined, provider: string) {
  if (!value) throw new Error(`${provider} is not configured`);
  return value;
}

export class FredAdapter {
  async observations(seriesId: string, start?: string): Promise<GatewayResult<z.infer<typeof fredSchema>>> {
    const config = getKairoDataV2ProviderConfigs().fred;
    const url = new URL("/fred/series/observations", config.baseUrl);
    url.searchParams.set("series_id", seriesId); url.searchParams.set("api_key", requireValue(config.apiKey, "FRED")); url.searchParams.set("file_type", "json");
    if (start) url.searchParams.set("observation_start", start);
    return providerGatewayV2.execute({ provider: "fred", dataset: "economic_observations", operation: "series_observations", requestKey: `${seriesId}:${start ?? "latest"}`, schema: fredSchema, task: () => officialJson(url, {}, config.timeoutMs), cache: { freshSeconds: 3_600, staleSeconds: 86_400 }, retryCount: 1, requestMetadata: { url } });
  }

  async releaseDates(start: string, end: string, offset = 0) {
    const config = getKairoDataV2ProviderConfigs().fred; const url = new URL("/fred/releases/dates", config.baseUrl);
    url.searchParams.set("api_key", requireValue(config.apiKey, "FRED")); url.searchParams.set("file_type", "json"); url.searchParams.set("realtime_start", start); url.searchParams.set("realtime_end", end); url.searchParams.set("include_release_dates_with_no_data", "true"); url.searchParams.set("limit", "1000"); url.searchParams.set("offset", String(Math.max(0, offset))); url.searchParams.set("order_by", "release_date"); url.searchParams.set("sort_order", "desc");
    const schema = z.object({ count: z.number(), offset: z.number(), limit: z.number(), release_dates: z.array(z.object({ release_id: z.number(), release_name: z.string(), date: z.string() }).passthrough()) }).passthrough();
    return providerGatewayV2.execute({ provider: "fred", dataset: "economic_release_dates", operation: "release_dates", requestKey: `${start}:${end}:${offset}`, schema, task: () => officialJson(url, {}, config.timeoutMs), cache: { freshSeconds: 21_600, staleSeconds: 172_800 }, requestMetadata: { url } });
  }
}

export class BlsAdapter {
  async series(seriesIds: string[], startYear: number, endYear: number): Promise<GatewayResult<z.infer<typeof blsSchema>>> {
    const config = getKairoDataV2ProviderConfigs().bls; const url = new URL("/publicAPI/v2/timeseries/data/", config.baseUrl);
    const body = { seriesid: seriesIds.slice(0, 50), startyear: String(startYear), endyear: String(endYear), ...(config.registrationKey ? { registrationkey: config.registrationKey } : {}) };
    return providerGatewayV2.execute({ provider: "bls", dataset: "economic_observations", operation: "timeseries", requestKey: `${seriesIds.join(",")}:${startYear}:${endYear}`, schema: blsSchema, task: () => officialJson(url, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) }, config.timeoutMs), cache: { freshSeconds: 21_600, staleSeconds: 172_800 }, requestMetadata: { url, body } });
  }
}

export class BeaAdapter {
  async data(params: Record<string, string>): Promise<GatewayResult<z.infer<typeof beaSchema>>> {
    const config = getKairoDataV2ProviderConfigs().bea; const url = new URL("/api/data", config.baseUrl);
    for (const [key, value] of Object.entries({ UserID: requireValue(config.userId, "BEA"), ResultFormat: "JSON", ...params })) url.searchParams.set(key, value);
    return providerGatewayV2.execute({ provider: "bea", dataset: "economic_observations", operation: params.method ?? "GetData", requestKey: JSON.stringify(params), schema: beaSchema, task: () => officialJson(url, {}, config.timeoutMs), cache: { freshSeconds: 21_600, staleSeconds: 604_800 }, requestMetadata: { url } });
  }
}

export class EiaAdapter {
  async series(route: string, query: Record<string, string> = {}): Promise<GatewayResult<z.infer<typeof eiaSchema>>> {
    const config = getKairoDataV2ProviderConfigs().eia; const safeRoute = route.replace(/^\/+/, "").replace(/[^a-zA-Z0-9_/-]/g, ""); const url = new URL(`/v2/${safeRoute}`, config.baseUrl);
    url.searchParams.set("api_key", requireValue(config.apiKey, "EIA")); url.searchParams.set("length", query.length ?? "500");
    for (const [key, value] of Object.entries(query)) url.searchParams.set(key, value);
    return providerGatewayV2.execute({ provider: "eia", dataset: "energy_observations", operation: "series", requestKey: `${safeRoute}:${JSON.stringify(query)}`, schema: eiaSchema, task: () => officialJson(url, {}, config.timeoutMs), cache: { freshSeconds: 10_800, staleSeconds: 172_800 }, requestMetadata: { url } });
  }
}

export class USTreasuryAdapter {
  async yieldCurve(pageSize = 500): Promise<GatewayResult<z.infer<typeof treasurySchema>>> {
    const url = new URL("https://api.fiscaldata.treasury.gov/services/api/fiscal_service/v2/accounting/od/avg_interest_rates");
    url.searchParams.set("sort", "-record_date"); url.searchParams.set("page[size]", String(Math.min(pageSize, 5_000)));
    return providerGatewayV2.execute({ provider: "treasury", dataset: "treasury_rates", operation: "average_interest_rates", requestKey: String(pageSize), schema: treasurySchema, task: () => officialJson(url), cache: { freshSeconds: 21_600, staleSeconds: 604_800 }, requestMetadata: { url } });
  }
}

export class ECBDataAdapter {
  async data(flowRef: string, key: string, startPeriod?: string): Promise<GatewayResult<z.infer<typeof ecbSchema>>> {
    if (!/^[A-Z0-9_,.-]{1,80}$/.test(flowRef) || !/^[A-Z0-9+_,.-]{0,240}$/.test(key)) throw new Error("Invalid ECB series key");
    const url = new URL(`https://data-api.ecb.europa.eu/service/data/${flowRef}/${key}`); url.searchParams.set("format", "jsondata"); url.searchParams.set("detail", "dataonly"); if (startPeriod) url.searchParams.set("startPeriod", startPeriod);
    return providerGatewayV2.execute({ provider: "ecb", dataset: "economic_observations", operation: "sdmx_data", requestKey: `${flowRef}:${key}:${startPeriod ?? "latest"}`, schema: ecbSchema, task: () => officialJson(url), cache: { freshSeconds: 21_600, staleSeconds: 604_800 }, requestMetadata: { url } });
  }
}

export class EurostatAdapter {
  async statistics(dataset: string, filters: Record<string, string> = {}): Promise<GatewayResult<z.infer<typeof eurostatSchema>>> {
    if (!/^[A-Za-z0-9_]{2,80}$/.test(dataset)) throw new Error("Invalid Eurostat dataset");
    const url = new URL(`https://ec.europa.eu/eurostat/api/dissemination/statistics/1.0/data/${dataset}`); url.searchParams.set("lang", "en");
    for (const [key, value] of Object.entries(filters)) { if (/^[A-Za-z0-9_]{1,40}$/.test(key) && /^[A-Za-z0-9_.,-]{1,120}$/.test(value)) url.searchParams.set(key, value); }
    return providerGatewayV2.execute({ provider: "eurostat", dataset: "economic_observations", operation: "statistics", requestKey: `${dataset}:${JSON.stringify(filters)}`, schema: eurostatSchema, task: () => officialJson(url), cache: { freshSeconds: 43_200, staleSeconds: 604_800 }, requestMetadata: { url } });
  }
}

export const fredAdapter = new FredAdapter();
export const blsAdapter = new BlsAdapter();
export const beaAdapter = new BeaAdapter();
export const eiaAdapter = new EiaAdapter();
export const usTreasuryAdapter = new USTreasuryAdapter();
export const ecbDataAdapter = new ECBDataAdapter();
export const eurostatAdapter = new EurostatAdapter();
export const officialCentralBankCalendarAdapter = new OfficialCentralBankCalendarAdapter();
