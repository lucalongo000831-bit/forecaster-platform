export type GlobalRiskStatus = "GREEN" | "YELLOW" | "ORANGE" | "RED";
export type SystemicStress = "NONE" | "WATCH" | "ELEVATED" | "ACTIVE";
export type RiskTrend = "IMPROVING" | "STABLE" | "DETERIORATING" | "RAPIDLY_DETERIORATING";
export type RiskConfidence = "VERY_LOW" | "LOW" | "MEDIUM" | "HIGH" | "VERY_HIGH";
export type RiskDataType = "DIRECT" | "CALCULATED_FROM_DIRECT" | "PROXY" | "LAST_KNOWN_GOOD" | "MISSING" | "UNAVAILABLE";
export type GlobalRiskComponentKey = "VOLATILITY" | "CREDIT" | "LIQUIDITY" | "RATES" | "MARKET_BREADTH" | "EQUITY_STRESS" | "CROSS_ASSET" | "MACRO" | "ENERGY" | "POSITIONING" | "NEWS_GEOPOLITICAL";

export interface RiskMetric {
  key: string;
  label: string;
  value: number | null;
  displayValue: string;
  stressScore: number | null;
  dataType: RiskDataType;
  source: string;
  asOf: string | null;
  detail?: string;
}

export interface GlobalRiskComponent {
  key: GlobalRiskComponentKey;
  label: string;
  score: number | null;
  change: number | null;
  weight: number;
  contribution: number;
  completeness: number;
  classification: string;
  confidence: RiskConfidence;
  summary: string;
  metrics: RiskMetric[];
  sources: string[];
  freshness?: "FRESH" | "STALE" | "UNAVAILABLE";
  isLastKnownGood?: boolean;
}

export interface RiskDriver {
  component: string;
  score: number;
  change: number | null;
  contribution: number;
}

export interface RiskTrigger {
  id: string;
  direction: "ESCALATION" | "DE_ESCALATION";
  label: string;
  threshold: string;
  active: boolean;
}

export interface GlobalRiskSource {
  provider: string;
  category: "MARKET" | "MACRO" | "NEWS" | "CALCULATED";
  asOf: string | null;
  freshness: string;
  available: boolean;
}

export interface CrossAssetRow {
  symbol: string;
  name: string;
  price: number | null;
  oneDay: number | null;
  fiveDay: number | null;
  oneMonth: number | null;
  volatility: number | null;
  trend: "UP" | "DOWN" | "SIDEWAYS" | "UNAVAILABLE";
  stressContribution: number | null;
  source: string;
}

export interface EquityMarketRow extends CrossAssetRow {
  drawdown52Week: number | null;
  sma50: number | null;
  sma200: number | null;
  rsi14: number | null;
}

export interface GlobalRiskSummary {
  headline: string;
  shortSummary: string;
  riskSummary: string;
  stabilitySummary: string;
}

export interface GlobalRiskSnapshot {
  id: string | null;
  status: GlobalRiskStatus;
  score: number;
  previousStatus: GlobalRiskStatus | null;
  previousScore: number | null;
  change: number | null;
  trend: RiskTrend;
  systemicStress: SystemicStress;
  confidence: RiskConfidence;
  dataCompleteness: number;
  directDataCoverage: number;
  proxyShare: number;
  activeLayers: number;
  staleLayers: number;
  dataStatus: "AVAILABLE" | "PARTIAL" | "STALE" | "SOURCE_UNAVAILABLE";
  components: GlobalRiskComponent[];
  riskDrivers: RiskDriver[];
  stabilizingFactors: string[];
  escalationTriggers: RiskTrigger[];
  deEscalationTriggers: RiskTrigger[];
  summary: GlobalRiskSummary;
  equityMarkets: EquityMarketRow[];
  crossAssets: CrossAssetRow[];
  calculatedAt: string;
  inputTimestamp: string;
  lastStatusChangeAt: string | null;
  modelVersion: string;
  sources: GlobalRiskSource[];
}

export interface GlobalRiskHistoryPoint {
  id: string;
  score: number;
  status: GlobalRiskStatus;
  systemicStress: SystemicStress;
  trend: RiskTrend;
  calculatedAt: string;
  statusChanged: boolean;
}

export interface GlobalRiskHistoryReference {
  oneDay: number | null;
  fiveDay: number | null;
  twentyDay: number | null;
  previousScore: number | null;
  previousStatus: GlobalRiskStatus | null;
  lastStatusChangeAt: string | null;
}

export interface GlobalStressEngineInput {
  components: GlobalRiskComponent[];
  history: GlobalRiskHistoryReference;
  equityMarkets?: EquityMarketRow[];
  crossAssets?: CrossAssetRow[];
  sources?: GlobalRiskSource[];
  inputTimestamp?: string;
  calculatedAt?: string;
}
