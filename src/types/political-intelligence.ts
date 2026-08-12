import type { MarketChartPoint } from "./market-api";

export type PoliticalChamber = "HOUSE" | "SENATE" | "UNKNOWN";
export type PoliticalParty = "DEMOCRATIC" | "REPUBLICAN" | "INDEPENDENT" | "OTHER" | "UNKNOWN";
export type PoliticalOwnerType = "SELF" | "SPOUSE" | "DEPENDENT" | "JOINT" | "TRUST" | "OTHER" | "UNKNOWN";
export type PoliticalTransactionType = "PURCHASE" | "SALE_FULL" | "SALE_PARTIAL" | "SALE" | "EXCHANGE" | "OPTION" | "OTHER" | "UNKNOWN";
export type PoliticalVerificationStatus = "PROVIDER_ONLY" | "OFFICIAL_SOURCE_VERIFIED" | "SOURCE_MISMATCH" | "PENDING" | "UNVERIFIABLE";
export type PoliticalAmountMethod = "EXACT" | "MIDPOINT_ESTIMATE" | "UNKNOWN";
export type PoliticalDirection = "STRONG_BUYING" | "BUYING" | "BALANCED" | "NEUTRAL" | "SELLING" | "STRONG_SELLING" | "INSUFFICIENT_DATA";
export type PoliticalConfidence = "VERY_LOW" | "LOW" | "MEDIUM" | "HIGH" | "VERY_HIGH";
export type PoliticalClusterStrength = "NONE" | "WEAK" | "MODERATE" | "STRONG";
export type PoliticalPeriod = "7D" | "30D" | "90D" | "6M" | "1Y" | "3Y" | "5Y" | "MAX";
export type PoliticalPerformanceClassification = "OUTPERFORMED" | "UNDERPERFORMED" | "NEUTRAL" | "INSUFFICIENT_HISTORY";
export type PoliticalResultStatus = "VERIFIED_ACTIVITY" | "VERIFIED_ZERO" | "PARTIAL_DATA" | "DATASET_INITIALIZING" | "LAST_KNOWN_GOOD" | "UNSUPPORTED";

export interface PoliticalDatasetCoverage {
  status: PoliticalResultStatus;
  requestedFrom: string | null;
  requestedTo: string;
  historyFrom: string | null;
  historyTo: string | null;
  historyCoveragePercent: number;
  mappingRate: number;
  ingestedRecords: number;
  sourceHealthy: boolean;
  isLastKnownGood: boolean;
  reason: string;
  suggestedPeriod: PoliticalPeriod | null;
}

export interface Politician {
  id: string;
  normalizedName: string;
  displayName: string;
  chamber: PoliticalChamber;
  party: PoliticalParty;
  state: string | null;
  district: string | null;
  activeStatus: "ACTIVE" | "INACTIVE" | "UNKNOWN";
  sourceIdentifiers: Record<string, string>;
  createdAt: string;
  updatedAt: string;
}

export interface PoliticalTransaction {
  id: string;
  sourceId: string;
  politicianId: string;
  politicianName: string;
  chamber: PoliticalChamber;
  party: PoliticalParty;
  state: string | null;
  district: string | null;
  ownerType: PoliticalOwnerType;
  assetName: string;
  assetType: string | null;
  sector: string | null;
  rawTicker: string | null;
  canonicalInstrumentId: string | null;
  canonicalIssuerId: string | null;
  symbol: string | null;
  transactionType: PoliticalTransactionType;
  transactionDate: string;
  disclosureDate: string;
  marketAvailableDate: string;
  disclosureDelayDays: number;
  amountMin: number | null;
  amountMax: number | null;
  amountRangeRaw: string | null;
  estimatedAmount: number | null;
  amountMethod: PoliticalAmountMethod;
  priceAtTransaction: number | null;
  priceAtDisclosure: number | null;
  currentPrice: number | null;
  sharesEstimate: number | null;
  source: string;
  sourceUrl: string | null;
  filingId: string | null;
  filingType: string | null;
  provider: "fmp";
  fetchedAt: string;
  verified: boolean;
  verificationStatus: PoliticalVerificationStatus;
  resolutionStatus: "RESOLVED" | "UNRESOLVED_ASSET" | "NON_MARKET_ASSET";
  fingerprint: string;
  amendment: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface PoliticalTradePerformance {
  transactionId: string;
  symbol: string;
  benchmarkSymbol: string;
  marketAvailableDate: string;
  entryPrice: number | null;
  returns: Record<"1D" | "5D" | "20D" | "60D" | "120D", number | null>;
  relativeReturns: Record<"1D" | "5D" | "20D" | "60D" | "120D", number | null>;
  maxFavorableExcursion: number | null;
  maxAdverseExcursion: number | null;
  classification: PoliticalPerformanceClassification;
  calculatedAt: string;
  modelVersion: "political-performance-v1";
}

export interface PoliticalCluster {
  id: string;
  symbol: string | null;
  direction: "PURCHASE" | "SALE";
  strength: PoliticalClusterStrength;
  windowDays: number;
  uniquePoliticians: number;
  transactionCount: number;
  estimatedAmount: number;
  chamberCount: number;
  firstDisclosureDate: string;
  lastDisclosureDate: string;
  politicianIds: string[];
  transactionIds: string[];
  confidence: PoliticalConfidence;
  modelVersion: "political-cluster-v1";
}

export interface PoliticalActivitySummary {
  period: PoliticalPeriod;
  from: string | null;
  to: string;
  purchaseCount: number;
  saleCount: number;
  purchaseMin: number;
  purchaseMax: number;
  saleMin: number;
  saleMax: number;
  estimatedPurchaseValue: number;
  estimatedSaleValue: number;
  netEstimatedActivity: number;
  purchaseToSaleRatio: number | null;
  uniquePoliticians: number;
  uniqueBuyers: number;
  uniqueSellers: number;
  houseCount: number;
  senateCount: number;
  direction: PoliticalDirection;
  directionScore: number;
  activityIntensityScore: number;
  politicalActivityScore: number;
  momentumScore: number;
  clusterBuying: PoliticalClusterStrength;
  clusterSelling: PoliticalClusterStrength;
  lastDisclosureDate: string | null;
  medianDisclosureDelay: number | null;
  averageDisclosureDelay: number | null;
  delayP25: number | null;
  delayP75: number | null;
  delayP90: number | null;
  dataCompleteness: number;
  confidence: PoliticalConfidence;
  modelVersion: "political-activity-v1";
}

export interface PoliticalBreakdownRow {
  key: string;
  label: string;
  purchaseCount: number;
  saleCount: number;
  uniquePoliticians: number;
  estimatedActivity: number;
  direction: PoliticalDirection;
  intensity: number;
}

export interface PoliticalTimelinePoint {
  date: string;
  purchases: number;
  sales: number;
  estimatedActivity: number;
}

export interface PoliticalHistoricalStudy {
  side: "PURCHASE" | "SALE";
  sampleSize: number;
  confidence: PoliticalConfidence;
  mean: Record<"5D" | "20D" | "60D" | "120D", number | null>;
  median: Record<"5D" | "20D" | "60D" | "120D", number | null>;
  hitRate: Record<"5D" | "20D" | "60D" | "120D", number | null>;
  standardDeviation: Record<"5D" | "20D" | "60D" | "120D", number | null>;
}

export interface PoliticalIntelligenceReport {
  scope: "GLOBAL" | "SYMBOL";
  symbol: string | null;
  name: string;
  period: PoliticalPeriod;
  summary: PoliticalActivitySummary;
  transactions: PoliticalTransaction[];
  totalTransactions: number;
  page: number;
  pageSize: number;
  totalPages: number;
  clusters: PoliticalCluster[];
  performances: PoliticalTradePerformance[];
  historicalStudy: PoliticalHistoricalStudy[];
  priceHistory: MarketChartPoint[];
  timeline: PoliticalTimelinePoint[];
  chamberBreakdown: PoliticalBreakdownRow[];
  partyBreakdown: PoliticalBreakdownRow[];
  sectorBreakdown: PoliticalBreakdownRow[];
  politicianBreakdown: PoliticalBreakdownRow[];
  mostPurchased: PoliticalBreakdownRow[];
  mostSold: PoliticalBreakdownRow[];
  unresolvedAssets: Array<{ assetName: string; rawTicker: string | null; politicianName: string; transactionDate: string; attemptedMappings: string[] }>;
  sources: Array<{ provider: string; label: string; url: string | null; fetchedAt: string; verificationStatus: PoliticalVerificationStatus }>;
  limitations: string[];
  calculatedAt: string;
  resultStatus: PoliticalResultStatus;
  coverage: PoliticalDatasetCoverage;
}

export interface PoliticianActivityReport {
  politician: Politician;
  summary: PoliticalActivitySummary;
  transactions: PoliticalTransaction[];
  mostTradedAssets: PoliticalBreakdownRow[];
  sectorAllocation: PoliticalBreakdownRow[];
  performances: PoliticalTradePerformance[];
  historicalStudy: PoliticalHistoricalStudy[];
  limitations: string[];
  calculatedAt: string;
}

export interface PoliticalLeaderboardReport {
  period: PoliticalPeriod;
  summary: PoliticalActivitySummary;
  latest: PoliticalTransaction[];
  mostActivePoliticians: PoliticalBreakdownRow[];
  mostPurchased: PoliticalBreakdownRow[];
  mostSold: PoliticalBreakdownRow[];
  clusters: PoliticalCluster[];
  sectors: PoliticalBreakdownRow[];
  timeline: PoliticalTimelinePoint[];
  politicians: Politician[];
  historicalStudy: PoliticalHistoricalStudy[];
  performanceSampleSize: number;
  page: number;
  pageSize: number;
  totalPages: number;
  totalTransactions: number;
  mappedTransactions: number;
  unresolvedAssets: number;
  duplicateRate: number;
  verifiedRecords: number;
  dataCompleteness: number;
  calculatedAt: string;
  resultStatus: PoliticalResultStatus;
  coverage: PoliticalDatasetCoverage;
}

export interface PoliticalFilters {
  period?: PoliticalPeriod;
  chamber?: PoliticalChamber | "ALL";
  party?: PoliticalParty | "ALL";
  transactionType?: PoliticalTransactionType | "ALL";
  ownerType?: PoliticalOwnerType | "ALL";
  symbol?: string;
  sector?: string;
  politician?: string;
  query?: string;
  clusterOnly?: boolean;
  sort?: "DISCLOSURE_DATE" | "TRANSACTION_DATE" | "AMOUNT" | "DELAY" | "PERFORMANCE" | "POLITICIAN";
  page?: number;
  pageSize?: number;
}
