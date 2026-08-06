import type { FinancialDataProvider } from "./financial-data-provider";
import { MockFinancialDataProvider } from "./mock-financial-data-provider";

// This is the only provider selection point. Replace this instance with a
// YahooFinanceProvider later without changing pages or visual components.
export const financialDataService: FinancialDataProvider = new MockFinancialDataProvider();
