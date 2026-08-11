export type EconomicTransform = "LEVEL" | "YOY" | "MOM" | "CHANGE";

export interface EconomicSeriesDefinition {
  key: string;
  provider: "fred" | "bls" | "bea" | "eia" | "treasury" | "ecb" | "eurostat";
  externalId: string;
  title: string;
  category: "rates" | "inflation" | "employment" | "credit" | "liquidity" | "growth" | "housing" | "financial_conditions" | "volatility" | "money" | "banking" | "energy";
  country: string;
  frequency: string;
  unit: string | null;
  importance: "LOW" | "MEDIUM" | "HIGH";
  transform: EconomicTransform;
}

export const economicSeriesRegistry: readonly EconomicSeriesDefinition[] = [
  { key: "us_policy_rate", provider: "fred", externalId: "DFF", title: "Federal Funds Effective Rate", category: "rates", country: "US", frequency: "DAILY", unit: "%", importance: "HIGH", transform: "LEVEL" },
  { key: "us_2y", provider: "fred", externalId: "DGS2", title: "2-Year Treasury Yield", category: "rates", country: "US", frequency: "DAILY", unit: "%", importance: "HIGH", transform: "LEVEL" },
  { key: "us_10y", provider: "fred", externalId: "DGS10", title: "10-Year Treasury Yield", category: "rates", country: "US", frequency: "DAILY", unit: "%", importance: "HIGH", transform: "LEVEL" },
  { key: "us_real_10y", provider: "fred", externalId: "DFII10", title: "10-Year Real Yield", category: "rates", country: "US", frequency: "DAILY", unit: "%", importance: "HIGH", transform: "LEVEL" },
  { key: "us_cpi", provider: "fred", externalId: "CPIAUCSL", title: "Consumer Price Index", category: "inflation", country: "US", frequency: "MONTHLY", unit: "index", importance: "HIGH", transform: "YOY" },
  { key: "us_core_pce", provider: "fred", externalId: "PCEPILFE", title: "Core PCE Price Index", category: "inflation", country: "US", frequency: "MONTHLY", unit: "index", importance: "HIGH", transform: "YOY" },
  { key: "us_payrolls", provider: "fred", externalId: "PAYEMS", title: "Nonfarm Payrolls", category: "employment", country: "US", frequency: "MONTHLY", unit: "thousands", importance: "HIGH", transform: "CHANGE" },
  { key: "us_unemployment", provider: "fred", externalId: "UNRATE", title: "Unemployment Rate", category: "employment", country: "US", frequency: "MONTHLY", unit: "%", importance: "HIGH", transform: "LEVEL" },
  { key: "us_gdp", provider: "fred", externalId: "GDPC1", title: "Real GDP", category: "growth", country: "US", frequency: "QUARTERLY", unit: "billions USD", importance: "HIGH", transform: "YOY" },
  { key: "us_high_yield_spread", provider: "fred", externalId: "BAMLH0A0HYM2", title: "US High Yield Option-Adjusted Spread", category: "credit", country: "US", frequency: "DAILY", unit: "%", importance: "HIGH", transform: "LEVEL" },
  { key: "us_financial_conditions", provider: "fred", externalId: "NFCI", title: "Chicago Fed National Financial Conditions Index", category: "financial_conditions", country: "US", frequency: "WEEKLY", unit: "index", importance: "HIGH", transform: "LEVEL" },
  { key: "us_m2", provider: "fred", externalId: "M2SL", title: "M2 Money Stock", category: "money", country: "US", frequency: "MONTHLY", unit: "billions USD", importance: "MEDIUM", transform: "YOY" },
  { key: "us_initial_claims", provider: "bls", externalId: "LNS14000000", title: "Unemployment Rate", category: "employment", country: "US", frequency: "MONTHLY", unit: "%", importance: "HIGH", transform: "LEVEL" },
  { key: "us_cpi_bls", provider: "bls", externalId: "CUUR0000SA0", title: "CPI All Urban Consumers", category: "inflation", country: "US", frequency: "MONTHLY", unit: "index", importance: "HIGH", transform: "YOY" },
  { key: "us_gdp_bea", provider: "bea", externalId: "NIPA:T10101:A191RL", title: "Real GDP", category: "growth", country: "US", frequency: "QUARTERLY", unit: "%", importance: "HIGH", transform: "LEVEL" },
  { key: "us_crude_inventory", provider: "eia", externalId: "petroleum/stoc/wstk/data", title: "US Crude Oil Stocks", category: "energy", country: "US", frequency: "WEEKLY", unit: "thousand barrels", importance: "HIGH", transform: "CHANGE" },
  { key: "us_gas_storage", provider: "eia", externalId: "natural-gas/stor/wkly/data", title: "US Natural Gas Storage", category: "energy", country: "US", frequency: "WEEKLY", unit: "Bcf", importance: "MEDIUM", transform: "CHANGE" },
  { key: "eu_hicp", provider: "eurostat", externalId: "prc_hicp_midx", title: "Euro Area HICP", category: "inflation", country: "EA", frequency: "MONTHLY", unit: "index", importance: "HIGH", transform: "YOY" },
  { key: "eu_unemployment", provider: "eurostat", externalId: "une_rt_m", title: "Euro Area Unemployment", category: "employment", country: "EA", frequency: "MONTHLY", unit: "%", importance: "HIGH", transform: "LEVEL" },
] as const;

export function seriesByProvider(provider: EconomicSeriesDefinition["provider"]) {
  return economicSeriesRegistry.filter((series) => series.provider === provider);
}
