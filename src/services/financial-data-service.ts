import type { FinancialDataProvider } from "./financial-data-provider";
import { YahooFinanceProvider } from "./yahoo-finance-provider";

// Stable presentation facade. All upstream selection happens in the central
// server-only router; unavailable data stays unavailable and is never fabricated.
export const financialDataService: FinancialDataProvider = new YahooFinanceProvider();
