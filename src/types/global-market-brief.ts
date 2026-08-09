import type { GlobalRiskStatus, RiskTrend, SystemicStress } from "@/engines/global-risk";

export type EditorialStatus = GlobalRiskStatus | "UNAVAILABLE";
export type EditorialSystemicStress = SystemicStress | "UNAVAILABLE";
export type EditorialRiskTrend = RiskTrend | "UNAVAILABLE";
export type EditorialSectionKey = "summary" | "volatility" | "credit" | "liquidity" | "rates" | "marketBreadth" | "crossAsset" | "macro" | "geopolitics" | "mainRisks" | "stabilizingFactors" | "escalationTriggers" | "finalView";

export interface ParsedGlobalMarketBrief {
  status: EditorialStatus;
  systemicStress: EditorialSystemicStress;
  riskTrend: EditorialRiskTrend;
  sections: Record<EditorialSectionKey, string>;
  missingSections: EditorialSectionKey[];
}

export interface GlobalMarketBriefInput extends ParsedGlobalMarketBrief {
  title: string;
  reportDate: string;
  rawText: string;
}

export interface GlobalMarketBrief extends GlobalMarketBriefInput {
  id: string;
  briefId: string;
  version: number;
  state: "DRAFT" | "PUBLISHED" | "ARCHIVED";
  publishedAt: string | null;
  publishedBy: string | null;
  createdAt: string;
  sourceLabel: "CHATGPT SCHEDULED ANALYSIS — MANUALLY PUBLISHED";
}

export interface EditorialBriefProvider {
  getCurrent(): Promise<GlobalMarketBrief | null>;
  getHistory(options?: { includeDrafts?: boolean; limit?: number }): Promise<GlobalMarketBrief[]>;
  saveDraft(input: GlobalMarketBriefInput, userId: string): Promise<GlobalMarketBrief>;
  publish(input: GlobalMarketBriefInput, userId: string): Promise<GlobalMarketBrief>;
  archive(versionId: string, userId: string): Promise<void>;
}
