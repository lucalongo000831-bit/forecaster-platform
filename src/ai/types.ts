export type KairoAssetType = "equity" | "etf" | "fund" | "index" | "crypto" | "forex" | "commodity" | "unknown";

export interface KairoPageContext {
  symbol?: string;
  market?: string;
  assetType?: KairoAssetType;
  currentPage?: string;
}

export interface KairoSource {
  provider: string;
  label: string;
  url: string | null;
  timestamp: string | null;
  symbol: string | null;
  currency: string | null;
  kind: "FACT" | "CALCULATED" | "ESTIMATE" | "MODEL_OUTPUT" | "ANALYST_CONSENSUS" | "SCENARIO";
}

export interface AnalysisContext extends KairoPageContext {
  instrument?: Record<string, unknown>;
  quote?: Record<string, unknown>;
  marketStatus?: Record<string, unknown>;
  companyProfile?: Record<string, unknown>;
  keyFinancialMetrics?: Record<string, unknown>;
  financialTrends?: unknown[];
  qualityScores?: Record<string, unknown>;
  technicalScores?: Record<string, unknown>;
  valuation?: Record<string, unknown> | null;
  analystData?: Record<string, unknown>;
  seasonality?: unknown;
  forecast?: unknown;
  risks?: unknown;
  redFlags?: unknown;
  catalysts?: unknown;
  news?: unknown;
  sentiment?: unknown;
  sources: KairoSource[];
  timestamps: Record<string, string | null>;
}

export type KairoStreamEvent =
  | { type: "conversation"; conversationId: string }
  | { type: "status"; message: string }
  | { type: "tool"; name: string; status: "running" | "complete" | "failed" }
  | { type: "delta"; text: string }
  | { type: "sources"; sources: KairoSource[] }
  | { type: "metadata"; model: string; promptVersion: string; toolCalls: number; responseId?: string }
  | { type: "done" }
  | { type: "error"; message: string; retryable: boolean };
