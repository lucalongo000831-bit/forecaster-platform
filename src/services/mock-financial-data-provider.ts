import { mockFinancialDataset } from "@/data/mock";
import type { FinancialDataProvider } from "./financial-data-provider";
import type { InstrumentRef } from "@/types";

export class MockFinancialDataProvider implements FinancialDataProvider {
  async getBrand() { return mockFinancialDataset.brand; }
  async getShellData() { return mockFinancialDataset.shell; }
  async getDashboardData() { return mockFinancialDataset.dashboard; }
  async getCalendarData() { return mockFinancialDataset.calendar; }
  async getWatchlist() { return mockFinancialDataset.watchlist; }
  async getPortfolioData() { return mockFinancialDataset.portfolio; }
  async getSearchUniverse() { return mockFinancialDataset.searchUniverse; }

  async getInstrument(ref: InstrumentRef) { void ref; return mockFinancialDataset.instrument; }
  async getOverview(ref: InstrumentRef) { void ref; return mockFinancialDataset.overview; }
  async getSeasonality(ref: InstrumentRef) { void ref; return mockFinancialDataset.seasonality; }
  async getPatterns(ref: InstrumentRef) { void ref; return mockFinancialDataset.pattern; }
  async getMomentum(ref: InstrumentRef) { void ref; return mockFinancialDataset.momentum; }
  async getFundamentals(ref: InstrumentRef) { void ref; return mockFinancialDataset.fundamentals; }
  async getPoliticalActivity(ref: InstrumentRef) { void ref; return mockFinancialDataset.political; }
  async getNews(ref: InstrumentRef) { void ref; return mockFinancialDataset.news; }
}
