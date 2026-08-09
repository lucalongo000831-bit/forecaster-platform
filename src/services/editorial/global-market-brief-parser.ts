import { z } from "zod";
import type { EditorialSectionKey, ParsedGlobalMarketBrief } from "@/types";

export const MAX_GLOBAL_BRIEF_BYTES = 100 * 1024;
export const GLOBAL_MARKET_BRIEF_TEMPLATE = `STATUS:

SYSTEMIC_STRESS:

RISK_TREND:

SUMMARY:

VOLATILITY:

CREDIT:

LIQUIDITY:

RATES:

MARKET_BREADTH:

CROSS_ASSET:

MACRO:

GEOPOLITICS:

MAIN_RISKS:

STABILIZING_FACTORS:

ESCALATION_TRIGGERS:

FINAL_VIEW:`;

const aliases: Record<string, EditorialSectionKey | "status" | "systemicStress" | "riskTrend"> = {
  STATUS: "status", SYSTEMIC_STRESS: "systemicStress", RISK_TREND: "riskTrend", SUMMARY: "summary",
  VOLATILITY: "volatility", CREDIT: "credit", LIQUIDITY: "liquidity", RATES: "rates",
  MARKET_BREADTH: "marketBreadth", CROSS_ASSET: "crossAsset", MACRO: "macro", GEOPOLITICS: "geopolitics",
  GEOPOLITICAL_RISK: "geopolitics", MAIN_RISKS: "mainRisks", STABILIZING_FACTORS: "stabilizingFactors",
  ESCALATION_TRIGGERS: "escalationTriggers", FINAL_VIEW: "finalView",
};
const sectionKeys: EditorialSectionKey[] = ["summary", "volatility", "credit", "liquidity", "rates", "marketBreadth", "crossAsset", "macro", "geopolitics", "mainRisks", "stabilizingFactors", "escalationTriggers", "finalView"];

export function sanitizeBriefText(input: string) {
  const normalized = input.replace(/\r\n?/g, "\n").replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, "").trim();
  if (new TextEncoder().encode(normalized).length > MAX_GLOBAL_BRIEF_BYTES) throw new Error("Report exceeds the 100 KB limit.");
  return normalized;
}

function matchHeading(line: string) {
  const cleaned = line.trim().replace(/^#{1,6}\s*/, "");
  for (const alias of Object.keys(aliases).sort((a, b) => b.length - a.length)) {
    const expression = alias.split("_").join("[\\s_-]+");
    const match = cleaned.match(new RegExp(`^(?:${expression})(?:\\s*(?::|-)\\s*(.*))?$`, "i"));
    if (match) return { target: aliases[alias]!, inline: match[1]?.trim() ?? "" };
  }
  return null;
}
function normalizeStatus(value: string): ParsedGlobalMarketBrief["status"] { const candidate = value.trim().toUpperCase(); return ["GREEN", "YELLOW", "ORANGE", "RED"].includes(candidate) ? candidate as ParsedGlobalMarketBrief["status"] : "UNAVAILABLE"; }
function normalizeSystemic(value: string): ParsedGlobalMarketBrief["systemicStress"] { const candidate = value.trim().toUpperCase().replaceAll(" ", "_"); if (["NO", "NONE", "NO_SYSTEMIC_STRESS"].includes(candidate)) return "NONE"; if (["YES", "ACTIVE", "SYSTEMIC_STRESS"].includes(candidate)) return "ACTIVE"; return ["WATCH", "ELEVATED"].includes(candidate) ? candidate as ParsedGlobalMarketBrief["systemicStress"] : "UNAVAILABLE"; }
function normalizeTrend(value: string): ParsedGlobalMarketBrief["riskTrend"] { const candidate = value.trim().toUpperCase().replace(/[\s-]+/g, "_"); return ["IMPROVING", "STABLE", "DETERIORATING", "RAPIDLY_DETERIORATING"].includes(candidate) ? candidate as ParsedGlobalMarketBrief["riskTrend"] : "UNAVAILABLE"; }

export function parseGlobalMarketBrief(rawInput: string): ParsedGlobalMarketBrief {
  const raw = sanitizeBriefText(rawInput);
  const buffers = Object.fromEntries(sectionKeys.map((key) => [key, [] as string[]])) as Record<EditorialSectionKey, string[]>;
  let status: ParsedGlobalMarketBrief["status"] = "UNAVAILABLE";
  let systemicStress: ParsedGlobalMarketBrief["systemicStress"] = "UNAVAILABLE";
  let riskTrend: ParsedGlobalMarketBrief["riskTrend"] = "UNAVAILABLE";
  let current: EditorialSectionKey | null = null;

  for (const line of raw.split("\n")) {
    const heading = matchHeading(line);
    if (heading) {
      const { target, inline } = heading;
      if (target === "status") status = normalizeStatus(inline);
      else if (target === "systemicStress") systemicStress = normalizeSystemic(inline);
      else if (target === "riskTrend") riskTrend = normalizeTrend(inline);
      else { current = target; if (inline) buffers[target].push(inline); }
      continue;
    }
    if (current) buffers[current].push(line);
  }

  const sections = Object.fromEntries(sectionKeys.map((key) => [key, buffers[key].join("\n").trim() || "Not provided."])) as Record<EditorialSectionKey, string>;
  return { status, systemicStress, riskTrend, sections, missingSections: sectionKeys.filter((key) => sections[key] === "Not provided.") };
}

export const globalMarketBriefInputSchema = z.object({
  title: z.string().trim().min(3).max(240),
  reportDate: z.iso.datetime(),
  status: z.enum(["GREEN", "YELLOW", "ORANGE", "RED", "UNAVAILABLE"]),
  systemicStress: z.enum(["NONE", "WATCH", "ELEVATED", "ACTIVE", "UNAVAILABLE"]),
  riskTrend: z.enum(["IMPROVING", "STABLE", "DETERIORATING", "RAPIDLY_DETERIORATING", "UNAVAILABLE"]),
  rawText: z.string().transform(sanitizeBriefText),
  sections: z.object(Object.fromEntries(sectionKeys.map((key) => [key, z.string().trim().max(20_000).default("Not provided.")])) as Record<EditorialSectionKey, z.ZodDefault<z.ZodString>>),
  missingSections: z.array(z.enum(sectionKeys as [EditorialSectionKey, ...EditorialSectionKey[]])).default([]),
});
