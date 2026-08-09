import type { DataQuality, FieldProvenance, MissingDataReason, ProviderName } from "@/providers/types";

export type InstrumentKind = "EQUITY" | "ETF" | "FUND" | "INDEX" | "CRYPTO" | "FOREX" | "COMMODITY";

export interface IssuerIdentity {
  id?: string;
  legalName: string;
  countryCode: string | null;
  lei: string | null;
  cik: string | null;
  isin: string | null;
  website: string | null;
  sector: string | null;
  industry: string | null;
  reportingCurrency?: string | null;
  comparableHistoryStartDate?: string | null;
}

export interface IssuerListing {
  symbol: string;
  providerSymbol: string;
  exchange: string;
  mic: string | null;
  currency: string;
  countryCode: string | null;
  primary: boolean;
  verificationUrl: string | null;
}

export interface ProviderSymbolMapping {
  provider: ProviderName;
  symbol: string;
  exchangeCode: string | null;
  providerInstrumentId: string | null;
  confidence: number;
  verifiedAt: string;
}

export interface ResolvedInstrument {
  canonicalSymbol: string;
  name: string;
  kind: InstrumentKind;
  exchange: string | null;
  mic: string | null;
  currency: string | null;
  tradingCurrency: string | null;
  countryCode: string | null;
  issuer: IssuerIdentity | null;
  listings?: IssuerListing[];
  mappings: ProviderSymbolMapping[];
  resolutionQuality: DataQuality;
  warnings: string[];
}

export interface MissingDataDetail {
  field: string;
  reason: MissingDataReason;
  message: string;
  attemptedProviders: ProviderName[];
}

export interface NormalizedFinancialPeriod {
  period: "annual" | "quarter" | "ttm";
  fiscalDate: string;
  filingDate: string | null;
  currency: string | null;
  revenue: number | null;
  grossProfit: number | null;
  operatingIncome: number | null;
  netIncome: number | null;
  ebitda: number | null;
  cash: number | null;
  totalAssets: number | null;
  totalDebt: number | null;
  totalEquity: number | null;
  operatingCashFlow: number | null;
  capitalExpenditure: number | null;
  freeCashFlow: number | null;
  dilutedShares: number | null;
  provenance: Record<string, FieldProvenance>;
}

export interface EtfProfile {
  symbol: string;
  name: string;
  issuer: string | null;
  category: string | null;
  domicile: string | null;
  inceptionDate: string | null;
  expenseRatio: number | null;
  assetsUnderManagement: number | null;
  nav: number | null;
  holdings: Array<{ symbol: string | null; name: string; weight: number | null; country: string | null; sector: string | null }>;
  sectorAllocation: Array<{ name: string; weight: number }>;
  countryAllocation: Array<{ name: string; weight: number }>;
}

export interface CryptoProfile {
  symbol: string;
  coinGeckoId: string;
  name: string;
  marketCap: number | null;
  marketCapRank: number | null;
  circulatingSupply: number | null;
  totalSupply: number | null;
  maxSupply: number | null;
  allTimeHigh: number | null;
  allTimeHighDate: string | null;
  volume24h: number | null;
  priceChange24h: number | null;
  priceChange7d: number | null;
  priceChange30d: number | null;
  description: string | null;
  categories: string[];
}

export interface AnalysisDataBundle {
  instrument: ResolvedInstrument;
  profile: Record<string, unknown> | null;
  quote: Record<string, unknown> | null;
  financials: NormalizedFinancialPeriod[];
  analyst: Record<string, unknown> | null;
  peers: string[];
  insiderTransactions: Array<Record<string, unknown>>;
  dividends: Array<Record<string, unknown>>;
  ownership: {
    institutions: Array<{ organization: string; reportDate: string; percentHeld: number; position: number; value: number }>;
    institutionalOwnership: number | null;
    insiderOwnership: number | null;
    institutionsCount: number | null;
  } | null;
  insiderSignal: { score: number | null; netShares: number | null; purchases: number; sales: number; confidence: "LOW" | "MEDIUM" | "HIGH" };
  dividendAnalytics: { payments: number; trailingAmount: number | null; growthRate: number | null; regularity: number | null };
  provenance: FieldProvenance[];
  missing: MissingDataDetail[];
  calculatedAt: string;
}

export interface EtfDataBundle {
  instrument: ResolvedInstrument;
  profile: EtfProfile | null;
  provenance: FieldProvenance[];
  missing: MissingDataDetail[];
  calculatedAt: string;
}

export interface CryptoDataBundle {
  instrument: ResolvedInstrument;
  profile: CryptoProfile | null;
  global: Record<string, number | null>;
  provenance: FieldProvenance[];
  missing: MissingDataDetail[];
  calculatedAt: string;
}
