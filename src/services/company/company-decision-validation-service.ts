import "server-only";

import { validateCompanyDecisions } from "@/engines/company";
import { financialProviderRouter } from "@/providers";
import { normalizeSymbol } from "@/services/yahoo/symbol-resolver";
import { loadCompanyDecisionSnapshots } from "./company-analysis-repository";

export async function executeCompanyDecisionValidation(symbol: string, from: string, to: string) {
  const normalized = normalizeSymbol(symbol);
  const snapshots = await loadCompanyDecisionSnapshots(normalized, from, to);
  if (!snapshots.length) return { result: validateCompanyDecisions({ symbol: normalized, snapshots: [], bars: [] }), providers: [] as string[] };
  const chart = await financialProviderRouter.analyticsChart(normalized, "MAX", "1d");
  return { result: validateCompanyDecisions({ symbol: normalized, snapshots, bars: chart.data.points }), providers: [chart.meta.provider] };
}
