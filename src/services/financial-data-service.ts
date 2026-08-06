import type { FinancialDataProvider } from "./financial-data-provider";
import { YahooFinanceProvider } from "./yahoo-finance-provider";

// Single provider selection point. Yahoo is server-only and every method owns a
// clearly identified mock/unavailable fallback so presentation components stay stable.
export const financialDataService: FinancialDataProvider = new YahooFinanceProvider();
