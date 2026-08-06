import type {
  BrandIdentity,
  CalendarData,
  DashboardData,
  FundamentalsData,
  InstrumentProfile,
  InstrumentRef,
  MomentumData,
  NewsData,
  OverviewData,
  PatternData,
  PoliticalData,
  PortfolioData,
  SearchInstrument,
  SeasonalityData,
  ShellData,
  WatchlistEntry,
} from "@/types";

/**
 * Stable boundary between the UI and any financial-data source.
 * A future YahooFinanceProvider only needs to implement this contract; pages and
 * presentation components remain unchanged.
 */
export interface FinancialDataProvider {
  getBrand(): Promise<BrandIdentity>;
  getShellData(): Promise<ShellData>;
  getDashboardData(): Promise<DashboardData>;
  getCalendarData(): Promise<CalendarData>;
  getWatchlist(): Promise<WatchlistEntry[]>;
  getPortfolioData(): Promise<PortfolioData>;
  getSearchUniverse(): Promise<SearchInstrument[]>;
  getInstrument(ref: InstrumentRef): Promise<InstrumentProfile>;
  getOverview(ref: InstrumentRef): Promise<OverviewData>;
  getSeasonality(ref: InstrumentRef): Promise<SeasonalityData>;
  getPatterns(ref: InstrumentRef): Promise<PatternData>;
  getMomentum(ref: InstrumentRef): Promise<MomentumData>;
  getFundamentals(ref: InstrumentRef): Promise<FundamentalsData>;
  getPoliticalActivity(ref: InstrumentRef): Promise<PoliticalData>;
  getNews(ref: InstrumentRef): Promise<NewsData>;
}
