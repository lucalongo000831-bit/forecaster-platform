export type CompanyConfidence = "VERY_LOW" | "LOW" | "MEDIUM" | "HIGH" | "VERY_HIGH";
export type CompanyVerdict = "STRONG_BUY" | "BUY" | "ACCUMULATE_ON_WEAKNESS" | "WATCH" | "HOLD" | "REDUCE" | "AVOID" | "SHORT_WATCH" | "SHORT" | "INSUFFICIENT_DATA";
export type CompanyAssessment = "EXCEPTIONAL" | "VERY_INTERESTING" | "INTERESTING" | "NEUTRAL" | "UNATTRACTIVE" | "AVOID" | "SHORT_THESIS" | "INSUFFICIENT_DATA";
export type EvidenceKind = "FACT" | "CALCULATED" | "ESTIMATE" | "MODEL_OUTPUT" | "ANALYST_CONSENSUS" | "SCENARIO";
export type Availability = "AVAILABLE" | "PARTIAL" | "DATA_NOT_AVAILABLE" | "NOT_APPLICABLE";
export type PipelineStageStatus = "complete" | "partial" | "unavailable" | "not-applicable" | "failed";

export interface CompanySource {
  provider: string;
  label: string;
  url: string | null;
  timestamp: string | null;
  kind: EvidenceKind;
}

export interface SourcedMetric {
  key: string;
  label: string;
  value: number | string | null;
  unit: string | null;
  currency: string | null;
  period: string | null;
  kind: EvidenceKind;
  provider: string | null;
  formula: string | null;
  status: Availability;
}

export interface ScoreDetail {
  score: number | null;
  confidence: CompanyConfidence;
  positives: string[];
  negatives: string[];
  missing: string[];
}

export interface HistoricalCompanyPeriod {
  fiscalDate: string;
  period: "annual" | "quarter";
  currency: string | null;
  revenue: number | null;
  grossProfit: number | null;
  ebitda: number | null;
  operatingIncome: number | null;
  netIncome: number | null;
  dilutedEps: number | null;
  dilutedShares: number | null;
  cash: number | null;
  totalAssets: number | null;
  goodwill: number | null;
  intangibles: number | null;
  totalDebt: number | null;
  netDebt: number | null;
  equity: number | null;
  workingCapital: number | null;
  operatingCashFlow: number | null;
  capitalExpenditure: number | null;
  freeCashFlow: number | null;
  acquisitions: number | null;
  buybacks: number | null;
  shareIssuance: number | null;
  dividends: number | null;
  stockBasedCompensation: number | null;
  provider: string;
}

export interface CompanyDataQuality {
  score: number;
  confidence: CompanyConfidence;
  completeness: number;
  stale: boolean;
  checks: Array<{ code: string; status: "PASS" | "WARN" | "FAIL"; message: string }>;
  missingFields: string[];
  divergences: string[];
}

export interface EarningsQualityAnalysis {
  score: number | null;
  cashConversionScore: number | null;
  accrualRiskScore: number | null;
  dilutionRiskScore: number | null;
  normalizationRiskScore: number | null;
  cashConversion: number | null;
  fcfToNetIncome: number | null;
  fcfMargin: number | null;
  fcfYield: number | null;
  fcfPerShare: number | null;
  ebitdaToFcfConversion: number | null;
  classification: "EXCELLENT" | "GOOD" | "FAIR" | "WEAK" | "NEGATIVE" | "NOT_ASSESSABLE";
  redFlags: string[];
  assumptions: string[];
  confidence: CompanyConfidence;
  modelVersion: string;
}

export interface CompanyQualityAnalysis {
  totalScore: number | null;
  growth: ScoreDetail;
  profitability: ScoreDetail;
  capitalEfficiency: ScoreDetail;
  balanceSheet: ScoreDetail;
  cashFlow: ScoreDetail;
  earningsQuality: ScoreDetail;
  moat: ScoreDetail;
  management: ScoreDetail;
  predictability: ScoreDetail;
  confidence: CompanyConfidence;
  modelVersion: string;
}

export interface MoatCategoryAssessment {
  category: string;
  present: boolean | null;
  strength: "STRONG" | "MODERATE" | "WEAK" | "NONE" | "UNCERTAIN";
  durationYears: number | null;
  quantitativeEvidence: string[];
  qualitativeEvidence: string[];
  threats: string[];
  confidence: CompanyConfidence;
}

export interface MoatAnalysis {
  classification: "WIDE" | "NARROW" | "WEAK" | "NONE" | "UNCERTAIN";
  score: number | null;
  categories: MoatCategoryAssessment[];
  confidence: CompanyConfidence;
  modelVersion: string;
}

export interface ManagementAnalysis {
  executionScore: number | null;
  capitalAllocationScore: number | null;
  shareholderAlignmentScore: number | null;
  credibilityScore: number | null;
  overallScore: number | null;
  evidence: string[];
  warnings: string[];
  confidence: CompanyConfidence;
  modelVersion: string;
}

export interface PeerComparison {
  symbol: string;
  name: string;
  verified: boolean;
  metrics: Record<string, number | null>;
  percentiles: Record<string, number | null>;
  provider: string;
}

export interface ValuationScenario {
  name: "BEAR" | "BASE" | "BULL";
  revenueGrowth: number;
  operatingMargin: number | null;
  discountRate: number;
  terminalGrowth: number;
  enterpriseValue: number | null;
  equityValue: number | null;
  fairValuePerShare: number | null;
  upsideDownside: number | null;
  assumptions: string[];
}

export interface ReverseDcfAnalysis {
  applicable: boolean;
  impliedFcfGrowth: number | null;
  explicitYears: number;
  discountRate: number | null;
  terminalGrowth: number | null;
  classification: "PRUDENT" | "REASONABLE" | "DEMANDING" | "VERY_AGGRESSIVE" | "UNSUSTAINABLE" | "UNAVAILABLE";
  explanation: string;
  confidence: CompanyConfidence;
  warnings: string[];
  modelVersion: string;
}

export interface CompanyValuation {
  multiples: SourcedMetric[];
  historicalPercentiles: Record<string, number | null>;
  peerPercentiles: Record<string, number | null>;
  reverseDcf: ReverseDcfAnalysis;
  scenarios: ValuationScenario[];
  fairValue: number | null;
  prudentFairValue: number | null;
  marginOfSafety: number | null;
  operationalPrices: {
    veryInteresting: [number, number] | null;
    interesting: [number, number] | null;
    accumulation: [number, number] | null;
    fairValue: [number, number] | null;
    fullyValued: [number, number] | null;
    avoid: [number, number] | null;
    euphoria: [number, number] | null;
  };
  sensitivity: Array<{ discountRate: number; terminalGrowth: number; fairValue: number | null }>;
  confidence: CompanyConfidence;
  modelVersion: string;
}

export type CompanyHorizon = "INTRADAY" | "NEXT_SESSION" | "1W" | "1M" | "3M" | "6M" | "1Y" | "3Y" | "5Y" | "10Y" | "15Y" | "20Y";
export interface TimeHorizonAssessment {
  horizon: CompanyHorizon;
  orientation: "LONG" | "NEUTRAL" | "SHORT";
  score: number | null;
  confidence: CompanyConfidence;
  centralTarget: number | null;
  bear: number | null;
  base: number | null;
  bull: number | null;
  impliedCagr: number | null;
  risk: string;
  catalysts: string[];
  invalidation: string | null;
  positives: string[];
  negatives: string[];
  asOf: string;
}

export interface DailyOutlook {
  marketPhase: "OPEN" | "PRE_MARKET" | "POST_MARKET" | "CLOSED" | "UNKNOWN";
  currentPrice: number;
  open: number | null;
  high: number | null;
  low: number | null;
  previousClose: number | null;
  atr: number | null;
  expectedVolatility: number | null;
  support1: number | null;
  support2: number | null;
  resistance1: number | null;
  resistance2: number | null;
  expectedRange: [number, number] | null;
  centralTarget: number | null;
  invalidation: number | null;
  confidence: CompanyConfidence;
  note: string;
}

export interface CompanyRiskItem {
  id: string;
  category: string;
  description: string;
  probability: "LOW" | "MEDIUM" | "HIGH";
  impact: "LOW" | "MEDIUM" | "HIGH";
  horizon: string;
  trend: "IMPROVING" | "STABLE" | "WORSENING" | "UNKNOWN";
  mitigations: string[];
  indicators: string[];
  sources: string[];
  confidence: CompanyConfidence;
}

export interface CompanyRedFlag {
  code: string;
  severity: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
  evidence: string;
  period: string | null;
  value: number | null;
  source: string | null;
  alternativeExplanation: string | null;
}

export interface CompanyCatalyst {
  title: string;
  direction: "POSITIVE" | "NEGATIVE";
  probability: "LOW" | "MEDIUM" | "HIGH";
  impact: "LOW" | "MEDIUM" | "HIGH";
  horizon: string;
  expectedDate: string | null;
  source: string | null;
  status: "CONFIRMED" | "ESTIMATED" | "MONITOR";
}

export interface CompanyRiskRegister {
  overallRiskScore: number | null;
  permanentCapitalLossRisk: number | null;
  valuationRisk: number | null;
  businessRisk: number | null;
  balanceSheetRisk: number | null;
  eventRisk: number | null;
  shortThesisScore: number | null;
  squeezeRisk: number | null;
  shortEligible: boolean;
  items: CompanyRiskItem[];
  redFlags: CompanyRedFlag[];
  catalysts: CompanyCatalyst[];
  confidence: CompanyConfidence;
  modelVersion: string;
}

export interface CompanyPipelineStage {
  name: string;
  status: PipelineStageStatus;
  durationMs: number;
  message: string | null;
}

export interface CompanyIntelligenceReport {
  symbol: string;
  market: string;
  name: string;
  exchange: string;
  sector: string | null;
  industry: string | null;
  currency: string;
  instrumentType: string;
  applicable: boolean;
  currentPrice: number | null;
  dailyChangePercent: number | null;
  marketCap: number | null;
  marketState: string;
  verdict: CompanyVerdict;
  assessment: CompanyAssessment;
  overallScore: number | null;
  confidence: CompanyConfidence;
  dataQuality: CompanyDataQuality;
  historical: HistoricalCompanyPeriod[];
  earningsQuality: EarningsQualityAnalysis | null;
  quality: CompanyQualityAnalysis | null;
  moat: MoatAnalysis | null;
  management: ManagementAnalysis | null;
  peers: PeerComparison[];
  valuation: CompanyValuation | null;
  horizons: TimeHorizonAssessment[];
  dailyOutlook: DailyOutlook | null;
  risks: CompanyRiskRegister | null;
  thesis: { verdict: string; whyItMayWork: string[]; whyItMayFail: string[]; monitor: string[] };
  sources: CompanySource[];
  limitations: string[];
  pipeline: CompanyPipelineStage[];
  modelVersion: string;
  scoringVersion: string;
  valuationVersion: string;
  signalVersion: string;
  reportVersion: string;
  dataTimestamp: string | null;
  calculatedAt: string;
}
