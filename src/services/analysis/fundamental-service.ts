import "server-only";

import { analyzeFundamentals } from "@/engines/fundamental";
import { financialProviderRouter } from "@/providers";
import { normalizeSymbol } from "@/services/yahoo/symbol-resolver";

export async function getFundamentalAnalysis(symbolInput: string) {
  const symbol = normalizeSymbol(decodeURIComponent(symbolInput));
  const [summary, income, balanceSheet, cashFlow, ratios, analyst] = await Promise.all([
    financialProviderRouter.fundamentals(symbol),
    financialProviderRouter.statements(symbol, "income", "annual", 6).catch(() => null),
    financialProviderRouter.statements(symbol, "balance-sheet", "annual", 6).catch(() => null),
    financialProviderRouter.statements(symbol, "cash-flow", "annual", 6).catch(() => null),
    financialProviderRouter.ratios(symbol, "annual", 6).catch(() => null),
    financialProviderRouter.analystConsensus(symbol).catch(() => null),
  ]);
  const analysis = analyzeFundamentals({ symbol, summary: summary.data, income: income?.data, balanceSheet: balanceSheet?.data, cashFlow: cashFlow?.data, ratios: ratios?.data, analyst: analyst?.data, source: summary.meta.provider });
  return { analysis, provider: summary.meta.provider, sourceTimestamp: analysis.dataTimestamp };
}
