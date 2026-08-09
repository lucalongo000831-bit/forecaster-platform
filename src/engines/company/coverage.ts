import type { AnalystConsensus } from "@/providers";
import type { FundamentalAnalysis } from "@/engines/fundamental";
import type { AutomotiveAnalysis, CompanyCoverageReport, CompanyDataQuality, CompanyRiskRegister, CompanySeasonalityWindow, CompanyValuation, CoverageField, HistoricalCompanyPeriod, ManagementAnalysis, MoatAnalysis, PeerComparison, ResolvedInstrument } from "@/types";

export const COMPANY_COVERAGE_MODEL_VERSION = "company-coverage-v2.0.0";

type Status = CoverageField["status"];
function present(value: unknown) { return value !== null && value !== undefined && value !== "" && (!Array.isArray(value) || value.length > 0); }
function field(section: string, name: string, value: unknown, source: string | null, missingStatus: Status = "MISSING", reason: string | null = null): CoverageField {
  return { field: `${section}.${name}`, section, status: present(value) ? "AVAILABLE" : missingStatus, source: present(value) ? source : null, reason: present(value) ? null : reason ?? "No verified value was available." };
}

export function calculateCompanyCoverage(input: {
  instrument: ResolvedInstrument | null;
  quote: { price?: number | null; volume?: number | null; open?: number | null; dayHigh?: number | null; dayLow?: number | null; marketCap?: number | null; currency?: string | null } | null;
  history: HistoricalCompanyPeriod[];
  fundamental: FundamentalAnalysis | null;
  valuation: CompanyValuation | null;
  analyst: AnalystConsensus | null;
  peers: PeerComparison[];
  management: ManagementAnalysis | null;
  moat: MoatAnalysis | null;
  automotive: AutomotiveAnalysis | null;
  risks: CompanyRiskRegister | null;
  seasonality: CompanySeasonalityWindow[];
  dataQuality: CompanyDataQuality;
  insiders: unknown[];
  dividends: unknown[];
  ownership: { institutions: unknown[]; institutionalOwnership: number | null; insiderOwnership: number | null } | null;
  technicalAvailable: boolean;
  forecastAvailable: boolean;
}): CompanyCoverageReport {
  const latest = input.history[0]; const metrics = input.fundamental?.metrics; const automotive = input.automotive;
  const valuationNotApplicable = (key: string): Status => {
    if (key === "trailingPe" && (latest?.dilutedEps ?? null) !== null && latest!.dilutedEps! <= 0) return "NOT_APPLICABLE";
    if (key === "evToEbitda" && (latest?.ebitda ?? null) !== null && latest!.ebitda! <= 0) return "NOT_APPLICABLE";
    if (key === "priceToFreeCashFlow" && (latest?.freeCashFlow ?? null) !== null && latest!.freeCashFlow! <= 0) return "NOT_APPLICABLE";
    if (key === "peg" && ((latest?.dilutedEps ?? null) !== null && latest!.dilutedEps! <= 0)) return "NOT_APPLICABLE";
    return "MISSING";
  };
  const fields: CoverageField[] = [
    field("Identity", "canonicalIssuer", input.instrument?.issuer?.legalName, "verified issuer registry"), field("Identity", "cik", input.instrument?.issuer?.cik, "SEC"), field("Identity", "isin", input.instrument?.issuer?.isin, "official issuer"), field("Identity", "lei", input.instrument?.issuer?.lei, null), field("Identity", "listings", input.instrument?.listings, "official issuer"), field("Identity", "reportingCurrency", input.instrument?.issuer?.reportingCurrency, "official filing"), field("Identity", "tradingCurrency", input.instrument?.tradingCurrency, "listing provider"),
    field("Market Data", "price", input.quote?.price, "listing provider"), field("Market Data", "open", input.quote?.open, "listing provider"), field("Market Data", "high", input.quote?.dayHigh, "listing provider"), field("Market Data", "low", input.quote?.dayLow, "listing provider"), field("Market Data", "volume", input.quote?.volume, "listing provider"), field("Market Data", "marketCap", input.quote?.marketCap, "listing price × official shares"),
    ...["revenue", "costOfRevenue", "grossProfit", "ebitda", "operatingIncome", "netIncome", "dilutedEps", "dilutedShares"].map((key) => field("Income Statement", key, latest?.[key as keyof HistoricalCompanyPeriod], latest?.provider ?? null)),
    ...["cash", "shortTermInvestments", "receivables", "inventory", "currentAssets", "propertyPlantEquipment", "totalAssets", "goodwill", "intangibles", "totalDebt", "totalLiabilities", "equity", "accountsPayable", "currentLiabilities"].map((key) => field("Balance Sheet", key, latest?.[key as keyof HistoricalCompanyPeriod], latest?.provider ?? null)),
    ...["operatingCashFlow", "capitalExpenditure", "freeCashFlow", "acquisitions", "shareIssuance", "dividends"].map((key) => field("Cash Flow", key, latest?.[key as keyof HistoricalCompanyPeriod], latest?.provider ?? null)),
    field("Cash Flow", "buybacks", input.history.find((period) => present(period.buybacks))?.buybacks, input.history.find((period) => present(period.buybacks))?.provider ?? null, "MISSING", "No verified buyback was reported in the comparable history."),
    ...["grossMargin", "operatingMargin", "ebitdaMargin", "netMargin", "freeCashFlowMargin"].map((key) => field("Profitability", key, metrics?.[key as keyof typeof metrics], "calculated")),
    ...["returnOnAssets", "returnOnEquity", "returnOnInvestedCapital", "assetTurnover"].map((key) => field("Capital Efficiency", key, metrics?.[key as keyof typeof metrics], "calculated")),
    ...["trailingPe", "forwardPe", "evToEbitda", "evToRevenue", "priceToSales", "priceToBook", "priceToFreeCashFlow", "freeCashFlowYield", "earningsYield", "dividendYield", "peg"].map((key) => field("Valuation", key, input.valuation?.multiples.find((metric) => metric.key === key)?.value, "calculated/provider", valuationNotApplicable(key), valuationNotApplicable(key) === "NOT_APPLICABLE" ? "The current denominator is non-positive, so this multiple is not economically meaningful." : null)),
    field("Valuation", "bearDcf", input.valuation?.scenarios.find((item) => item.name === "BEAR")?.fairValuePerShare, "calculated"), field("Valuation", "baseDcf", input.valuation?.scenarios.find((item) => item.name === "BASE")?.fairValuePerShare, "calculated"), field("Valuation", "bullDcf", input.valuation?.scenarios.find((item) => item.name === "BULL")?.fairValuePerShare, "calculated"), field("Valuation", "reverseDcf", input.valuation?.reverseDcf.applicable ? input.valuation.reverseDcf.impliedFcfGrowth : null, "calculated"),
    ...["targetLow", "targetConsensus", "targetMedian", "targetHigh", "analystCount", "asOf"].map((key) => field("Analyst", key, input.analyst?.[key as keyof AnalystConsensus], "analyst provider", "SOURCE_ERROR")),
    field("Peers", "verifiedSet", input.peers, "peer provider", "INSUFFICIENT_EVIDENCE"), field("Peers", "percentiles", input.peers.flatMap((peer) => Object.values(peer.percentiles)).filter(present), "calculated", "INSUFFICIENT_EVIDENCE"),
    ...["executionScore", "capitalAllocationScore", "shareholderAlignmentScore", "credibilityScore"].map((key) => field("Management", key, input.management?.[key as keyof ManagementAnalysis], "calculated", key === "credibilityScore" ? "INSUFFICIENT_EVIDENCE" : "MISSING")),
    ...(input.moat?.categories ?? []).map((item) => field("Moat", item.category, item.strength === "UNCERTAIN" ? null : item.strength, "calculated", "INSUFFICIENT_EVIDENCE", item.strength === "UNCERTAIN" ? "No sufficiently structured evidence supports a directional moat assessment." : null)),
    field("Automotive KPIs", "adjustedOperatingIncome", automotive?.adjustedOperatingIncome, "official filing"), field("Automotive KPIs", "industrialFreeCashFlow", automotive?.industrialFreeCashFlow, "official filing"), field("Automotive KPIs", "industrialNetFinancialPosition", automotive?.industrialNetFinancialPosition, "official filing"), field("Automotive KPIs", "shipments", automotive?.consolidatedShipments, "official filing"), field("Automotive KPIs", "segments", automotive?.segments, "official filing"), field("Automotive KPIs", "inventoryDays", automotive?.inventoryDays, "calculated"),
    field("Dividends", "eventHistory", input.dividends, "corporate-action provider", "SOURCE_ERROR"), field("Dividends", "cashPaid", latest?.dividends, latest?.provider ?? null),
    field("Insiders", "transactions", input.insiders, "insider provider", "INSUFFICIENT_EVIDENCE"),
    field("Ownership", "majorShareholders", input.ownership?.institutions, "ownership provider", "INSUFFICIENT_EVIDENCE"), field("Ownership", "institutionalOwnership", input.ownership?.institutionalOwnership, "ownership provider", "INSUFFICIENT_EVIDENCE"), field("Ownership", "insiderOwnership", input.ownership?.insiderOwnership, "ownership provider", "INSUFFICIENT_EVIDENCE"),
    field("Risks", "riskRegister", input.risks?.items, "calculated"), field("Risks", "redFlags", input.risks?.redFlags, "calculated"),
    field("Technicals", "listingIndicators", input.technicalAvailable ? true : null, "listing price history"),
    ...(["1Y", "5Y", "10Y", "15Y", "20Y"] as const).map((window) => field("Seasonality", window, input.seasonality.find((item) => item.window === window && item.observations > 0), "adjusted listing history", window === "1Y" || window === "5Y" ? "MISSING" : "INSUFFICIENT_EVIDENCE")),
    field("Forecast", "probabilisticDistribution", input.forecastAvailable ? true : null, "forecast engine", "MISSING"),
  ];
  const total = fields.length; const applicable = fields.filter((item) => item.status !== "NOT_APPLICABLE"); const covered = applicable.filter((item) => item.status === "AVAILABLE");
  const sectionNames = [...new Set(fields.map((item) => item.section))];
  const sections = sectionNames.map((section) => { const members = fields.filter((item) => item.section === section); const relevant = members.filter((item) => item.status !== "NOT_APPLICABLE"); const available = relevant.filter((item) => item.status === "AVAILABLE").length; const percentage = relevant.length ? available / relevant.length * 100 : 100; return { section, available, applicable: relevant.length, total: members.length, percentage, status: relevant.length === 0 ? "NOT_APPLICABLE" as const : percentage === 100 ? "AVAILABLE" as const : percentage > 0 ? "PARTIAL" as const : "MISSING" as const }; });
  return { rawDataCoverage: total ? covered.length / total * 100 : 0, applicableDataCoverage: applicable.length ? covered.length / applicable.length * 100 : 0, fields, sections, missingFields: applicable.filter((item) => item.status !== "AVAILABLE").map((item) => item.field), calculatedAt: new Date().toISOString(), modelVersion: COMPANY_COVERAGE_MODEL_VERSION };
}
