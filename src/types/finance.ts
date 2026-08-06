export type Signal = "BUY" | "HOLD" | "SELL";
export type DataSource = "yahoo" | "fmp" | "alpha-vantage" | "massive" | "calculated" | "mock" | "unavailable";

export interface InstrumentRef {
  market: string;
  symbol: string;
}

export interface BrandIdentity {
  name: string;
  suffix: string;
  tagline: string;
}

export interface QuoteSnapshot {
  price: number;
  change: number;
  changePercent: number;
  dayLow: number;
  dayHigh: number;
  volume: number;
  currency: string;
  marketStatus: string;
  open?: number;
  previousClose?: number;
  marketCap?: number;
  asOf?: string;
  isDelayed?: boolean;
  source?: DataSource;
}

export interface InstrumentProfile extends InstrumentRef {
  name: string;
  currency: string;
  country: string;
  category: string;
  sector: string;
  classifications: string[];
  quote: QuoteSnapshot;
  earnings: {
    daysUntil: number;
    dateLabel: string;
    consensusEps: number;
  };
  description?: string;
  exchange?: string;
  quoteType?: string;
  source?: DataSource;
}

export interface TimePoint {
  label: string;
  value: number;
  comparison?: number;
  volume?: number;
  buy?: number;
  sell?: number;
}

export interface SeasonalityPoint {
  week: number;
  current: number;
  average: number;
  analogue: number;
}

export interface AnnualPerformancePoint {
  year: string;
  value: number;
}

export interface FinancialPoint {
  year: string;
  sales: number;
  income: number;
  cashFlow: number;
  roe: number;
  debt: number;
  margin: number;
}

export interface InsiderTransaction {
  id: number;
  date: string;
  insider: string;
  role: string;
  security: string;
  transaction: "Sale" | "Purchase";
  value: number;
  shares: number;
}

export interface PoliticalTrade {
  id: number;
  name: string;
  role: string;
  party: "Civic" | "Union";
  region: string;
  type: "BUY" | "SELL";
  published: string;
  traded: string;
  amount: string;
  amountLevel: number;
}

export interface NewsArticle {
  id: number;
  title: string;
  source: string;
  date: string;
  url?: string;
}

export interface CalendarDay {
  day: number;
  signal: Signal;
  events: number;
}

export interface WatchlistEntry {
  symbol: string;
  name: string;
  price: number;
  changePercent: number;
  signal: Signal;
  currency?: string;
  market?: string;
  source?: DataSource;
}

export interface PortfolioPosition {
  symbol: string;
  quantity: number;
  averagePrice: number;
  currentPrice: number;
  currency?: string;
}

export interface SearchInstrument {
  symbol: string;
  name: string;
  type: "Stock" | "ETF" | "Index" | "Forex" | "Crypto";
  venue: string;
  price: number;
  href: string;
  currency?: string;
  source?: DataSource;
}

export interface ShellSearchResult {
  name: string;
  meta: string;
  href: string;
}

export interface ShellData {
  brand: BrandIdentity;
  primaryInstrument: InstrumentRef;
  searchResults: ShellSearchResult[];
  marketStatus: string;
  marketClosesIn: string;
  source?: DataSource;
}

export interface MarketPulseItem {
  name: string;
  value: string;
  change: string;
}

export interface DashboardData {
  greetingName: string;
  pulse: MarketPulseItem[];
  watchlist: WatchlistEntry[];
  spotlight: InstrumentProfile;
  spotlightSeries: TimePoint[];
  portfolioValue: number;
  monthlyPortfolioChange: number;
  signalSummary: string;
  constructivePercent: number;
  upcomingEvents: number;
  briefTitle: string;
  briefBody: string;
  source?: DataSource;
  demoSections?: string[];
}

export interface ReturnPeriod {
  label: string;
  value: number;
}

export interface OverviewData {
  priceSeries: TimePoint[];
  drawdownSeries: TimePoint[];
  annualPerformance: AnnualPerformancePoint[];
  dividendSeries: TimePoint[];
  returns: ReturnPeriod[];
  insiderTransactions: InsiderTransaction[];
  insiderTotalActivity: number;
  source?: DataSource;
  unavailableSections?: string[];
}

export interface SeasonalityData {
  series: SeasonalityPoint[];
  bestMonth: string;
  positiveYearsPercent: number;
  averageReturn: number;
  bias: string;
  source?: DataSource;
}

export interface PatternCase {
  id: number;
  direction: "bullish" | "bearish";
  start: string;
  end: string;
  performance: number;
  drop: number;
  rise: number;
}

export interface PatternData {
  series: TimePoint[];
  probability: { bullish: number; bearish: number };
  robustness: number;
  strength: string;
  assessment: string;
  correlatedEvent: {
    trade: string;
    date: string;
    performance: number;
    maxDrop: number;
  };
  cases: PatternCase[];
  source?: DataSource;
}

export interface MomentumMetric {
  label: string;
  value: number;
}

export interface MomentumData {
  mood: string;
  assessment: string;
  metrics: MomentumMetric[];
  dpoSeries: TimePoint[];
  oscillatorSeries: TimePoint[];
  source?: DataSource;
}

export interface SummaryMetric {
  label: string;
  value: string;
}

export interface FairValueMetric {
  label: string;
  value: number;
}

export interface RatioMetric {
  label: string;
  value: string;
  comparison: string;
}

export interface StatementRow {
  label: string;
  values: number[];
}

export interface Transcript {
  period: string;
  date: string;
  title: string;
  paragraphs: { speaker: string; text: string }[];
}

export interface RevenueProduct {
  name: string;
  value: number;
  color: string;
}

export interface RevenueYear {
  year: number;
  compute: number;
  data: number;
  networking: number;
  gaming: number;
}

export interface FundamentalsData {
  summaryColumns: SummaryMetric[][];
  financials: FinancialPoint[];
  fairValues: FairValueMetric[];
  averageFairValue: number;
  fairValueUpsidePercent: number;
  scoreSeries: TimePoint[];
  solidityScore: number;
  sharesSeries: TimePoint[];
  valueSignals: SummaryMetric[];
  products: RevenueProduct[];
  revenueByYear: RevenueYear[];
  ratios: RatioMetric[];
  statementPeriods: Array<number | string>;
  statementRows: StatementRow[];
  transcripts: Transcript[];
  source?: DataSource;
  unavailableSections?: string[];
}

export interface PoliticalData {
  chartSeries: TimePoint[];
  trades: PoliticalTrade[];
  source?: DataSource;
}

export interface NewsData {
  recaps: string[];
  articles: NewsArticle[];
  source?: DataSource;
}

export interface CalendarData {
  monthLabel: string;
  days: CalendarDay[];
  selectedEventTitle: string;
  selectedEventDescription: string;
}

export interface PortfolioData {
  positions: PortfolioPosition[];
  totalReturn: number;
  dayChangePercent: number;
}
