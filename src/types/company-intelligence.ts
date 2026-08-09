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
  value: number | null;
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
  costOfRevenue?: number | null;
  grossProfit: number | null;
  ebitda: number | null;
  operatingIncome: number | null;
  netIncome: number | null;
  dilutedEps: number | null;
  dilutedShares: number | null;
  sharesOutstanding?: number | null;
  cash: number | null;
  shortTermInvestments?: number | null;
  receivables?: number | null;
  inventory?: number | null;
  currentAssets?: number | null;
  propertyPlantEquipment?: number | null;
  totalAssets: number | null;
  goodwill: number | null;
  intangibles: number | null;
  totalDebt: number | null;
  netDebt: number | null;
  equity: number | null;
  totalLiabilities?: number | null;
  accountsPayable?: number | null;
  currentLiabilities?: number | null;
  shortTermDebt?: number | null;
  longTermDebt?: number | null;
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
  inventoryGrowth?: number | null;
  inventoryToRevenue?: number | null;
  receivablesGrowth?: number | null;
  receivablesToRevenue?: number | null;
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
  assessment?: string;
  evidence?: string[];
  counterEvidence?: string[];
  quantitativeSupport?: Record<string, number | null>;
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
  impliedRevenueCagr?: number | null;
  impliedNormalizedMargin?: number | null;
  explicitYears: number;
  discountRate: number | null;
  terminalGrowth: number | null;
  classification: "VERY_LOW_EXPECTATIONS" | "CONSERVATIVE" | "REASONABLE" | "DEMANDING" | "AGGRESSIVE" | "UNAVAILABLE";
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
  normalized?: { revenue: number | null; operatingMargin: number | null; netIncome: number | null; freeCashFlow: number | null; method: string; periods: string[] };
  marginOfSafetyByScenario?: { bear: number | null; base: number | null; bull: number | null; composite: number | null };
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

export interface CompanySeasonalityWindow {
  window: "1Y" | "5Y" | "10Y" | "15Y" | "20Y";
  mean: number | null;
  median: number | null;
  hitRate: number | null;
  standardDeviation: number | null;
  best: number | null;
  worst: number | null;
  observations: number;
  quality: string;
  direction: "FAVORABLE" | "NEUTRAL" | "UNFAVORABLE" | "INSUFFICIENT";
  provider: string;
}

export interface OperationalCalendarDay {
  date: string;
  orientation: "LONG" | "NEUTRAL" | "SHORT";
  action: "BUY" | "HOLD" | "SELL";
  confidence: CompanyConfidence;
  expectedRange: [number, number] | null;
  target: number | null;
  support: number | null;
  resistance: number | null;
  events: Array<{ title: string; type: string; status: "CONFIRMED" | "ESTIMATE" | "MODEL"; provider: string }>;
  elevatedRisk: boolean;
}

export interface CompanyRiskItem {
  id: string;
  category: string;
  description: string;
  probability: "LOW" | "MEDIUM" | "HIGH" | "UNKNOWN";
  impact: "LOW" | "MEDIUM" | "HIGH";
  horizon: string;
  trend: "IMPROVING" | "STABLE" | "WORSENING" | "UNKNOWN";
  mitigations: string[];
  indicators: string[];
  sources: string[];
  lastUpdated?: string | null;
  confidence: CompanyConfidence;
}

export interface AutomotiveSegmentAnalysis {
  name: string;
  revenue: number | null;
  shareOfRevenue: number | null;
  revenueGrowth: number | null;
  adjustedOperatingIncome: number | null;
  adjustedOperatingMargin: number | null;
  shipments: number | null;
  shipmentGrowth: number | null;
}

export interface AutomotiveAnalysis {
  applicable: boolean;
  adjustedOperatingIncome: number | null;
  adjustedOperatingMargin: number | null;
  industrialFreeCashFlow: number | null;
  consolidatedFreeCashFlow: number | null;
  industrialNetFinancialPosition: number | null;
  consolidatedNetDebt: number | null;
  consolidatedShipments: number | null;
  shipmentGrowth: number | null;
  inventoryDays: number | null;
  capexToRevenue: number | null;
  assetTurnover: number | null;
  cyclicalityScore: number | null;
  downcycleSensitivity: "LOW" | "MEDIUM" | "HIGH" | "UNKNOWN";
  segments: AutomotiveSegmentAnalysis[];
  brandPortfolio: string[];
  centralizedDesignAndManufacturing: boolean;
  dealerFinanceOffering: boolean;
  evidence: string[];
  limitations: string[];
  confidence: CompanyConfidence;
  sourceUrl: string | null;
  modelVersion: string;
}

export type CoverageFieldStatus = "AVAILABLE" | "PARTIAL" | "MISSING" | "INSUFFICIENT_EVIDENCE" | "SOURCE_ERROR" | "NOT_APPLICABLE";
export interface CoverageField {
  field: string;
  section: string;
  status: CoverageFieldStatus;
  source: string | null;
  reason: string | null;
}
export interface SectionCoverage { section: string; available: number; applicable: number; total: number; percentage: number; status: "AVAILABLE" | "PARTIAL" | "MISSING" | "NOT_APPLICABLE"; }
export interface CompanyCoverageReport {
  rawDataCoverage: number;
  applicableDataCoverage: number;
  fields: CoverageField[];
  sections: SectionCoverage[];
  missingFields: string[];
  calculatedAt: string;
  modelVersion: string;
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

export interface CompanyMacroAnalysis {
  macroSensitivityScore: number | null;
  geopoliticalRiskScore: number | null;
  rateSensitivity: "LOW" | "MEDIUM" | "HIGH" | "UNKNOWN";
  inflationSensitivity: "LOW" | "MEDIUM" | "HIGH" | "UNKNOWN";
  currencySensitivity: "LOW" | "MEDIUM" | "HIGH" | "UNKNOWN";
  commoditySensitivity: "LOW" | "MEDIUM" | "HIGH" | "UNKNOWN";
  recessionSensitivity: "LOW" | "MEDIUM" | "HIGH" | "UNKNOWN";
  evidence: string[];
  limitations: string[];
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
  seasonality: CompanySeasonalityWindow[];
  operationalCalendar: OperationalCalendarDay[];
  risks: CompanyRiskRegister | null;
  macro: CompanyMacroAnalysis | null;
  automotive?: AutomotiveAnalysis | null;
  coverage?: CompanyCoverageReport;
  forecast?: import("@/engines/forecast").ForecastAnalysis | null;
  ownership?: import("./data-coverage").AnalysisDataBundle["ownership"];
  thesis: { verdict: string; whyItMayWork: string[]; whyItMayFail: string[]; monitor: string[] };
  sources: CompanySource[];
  fieldProvenance?: import("@/providers/types").FieldProvenance[];
  missingData?: import("./data-coverage").MissingDataDetail[];
  limitations: string[];
  pipeline: CompanyPipelineStage[];
  modelVersion: string;
  scoringVersion: string;
  valuationVersion: string;
  signalVersion: string;
  reportVersion: string;
  providerVersions: Record<string, string>;
  dataTimestamp: string | null;
  calculatedAt: string;
}
