import type { NewsIntelligenceAnalysis } from "@/engines/news";
import { clamp } from "@/engines/shared/statistics";
import type { CompanyCatalyst, CompanyConfidence, CompanyMacroAnalysis, CompanySource } from "@/types";

export const COMPANY_MACRO_MODEL_VERSION = "company-macro-v1.0.0";
type Sensitivity = CompanyMacroAnalysis["rateSensitivity"];
const highRate = /bank|financial|real estate|utility|insurance/i;
const highCommodity = /energy|oil|gas|mining|materials|airline|automotive/i;
const highCycle = /consumer cyclical|automotive|industrial|semiconductor|travel|retail/i;

function confidence(evidence: number): CompanyConfidence { return evidence >= 4 ? "MEDIUM" : evidence >= 2 ? "LOW" : "VERY_LOW"; }
function exposure(pattern: RegExp, sector: string, industry: string): Sensitivity { return pattern.test(`${sector} ${industry}`) ? "HIGH" : sector || industry ? "MEDIUM" : "UNKNOWN"; }

export function analyzeMacroAndNews(input: { sector: string | null; industry: string | null; country: string | null; currency: string; news: NewsIntelligenceAnalysis | null }): { macro: CompanyMacroAnalysis; catalysts: CompanyCatalyst[]; sources: CompanySource[] } {
  const sector = input.sector ?? ""; const industry = input.industry ?? "";
  const macroItems = input.news?.items.filter((item) => item.eventType === "MACRO") ?? [];
  const geoItems = input.news?.items.filter((item) => item.eventType === "GEOPOLITICS" || item.eventType === "REGULATORY") ?? [];
  const evidence: string[] = [];
  if (sector) evidence.push(`Sector classification: ${sector}.`);
  if (industry) evidence.push(`Industry classification: ${industry}.`);
  if (macroItems.length) evidence.push(`${macroItems.length} sourced macro news items in the current window.`);
  if (geoItems.length) evidence.push(`${geoItems.length} sourced geopolitical/regulatory news items in the current window.`);
  const rateSensitivity = exposure(highRate, sector, industry);
  const commoditySensitivity = exposure(highCommodity, sector, industry);
  const recessionSensitivity = exposure(highCycle, sector, industry);
  const inflationSensitivity: Sensitivity = commoditySensitivity === "HIGH" || recessionSensitivity === "HIGH" ? "HIGH" : sector || industry ? "MEDIUM" : "UNKNOWN";
  const currencySensitivity: Sensitivity = input.currency && input.country ? "MEDIUM" : "UNKNOWN";
  const sensitivityValues = [rateSensitivity, inflationSensitivity, currencySensitivity, commoditySensitivity, recessionSensitivity].flatMap((value) => value === "HIGH" ? [80] : value === "MEDIUM" ? [50] : value === "LOW" ? [20] : []);
  const macroSensitivityScore = sensitivityValues.length ? sensitivityValues.reduce((sum, value) => sum + value, 0) / sensitivityValues.length : null;
  const geopoliticalRiskScore = geoItems.length ? clamp(35 + geoItems.filter((item) => item.sentiment === "NEGATIVE").length * 15 + geoItems.filter((item) => item.intensity === "HIGH").length * 12, 0, 100) : null;
  const catalysts = (input.news?.items ?? []).filter((item) => item.relevance >= 0.6 && item.intensity !== "LOW").slice(0, 8).map((item): CompanyCatalyst => ({ title: item.title, direction: item.expectedDirection === "NEGATIVE" ? "NEGATIVE" : "POSITIVE", probability: item.exposure === "DIRECT" ? "HIGH" : "MEDIUM", impact: item.intensity, horizon: item.impactHorizon.replaceAll("_", " "), expectedDate: item.publishedAt, source: item.canonicalUrl, status: "CONFIRMED" }));
  const sources = (input.news?.items ?? []).slice(0, 20).map((item): CompanySource => ({ provider: item.provider, label: `${item.publisher}: ${item.title}`, url: item.canonicalUrl, timestamp: item.publishedAt, kind: "FACT" }));
  return { macro: { macroSensitivityScore, geopoliticalRiskScore, rateSensitivity, inflationSensitivity, currencySensitivity, commoditySensitivity, recessionSensitivity, evidence, limitations: ["Sensitivity classifications are qualitative; no unsupported exposure percentages are inferred.", "Sector classification and recent news cannot replace issuer geographic or segment disclosures."], confidence: confidence(evidence.length), modelVersion: COMPANY_MACRO_MODEL_VERSION }, catalysts, sources };
}
