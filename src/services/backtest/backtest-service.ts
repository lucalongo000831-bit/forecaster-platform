import "server-only";

import { runBacktest, type BacktestConfiguration } from "@/engines/backtest";
import { getCurrentUser } from "@/lib/server/auth";
import { financialProviderRouter } from "@/providers";
import { normalizeSymbol } from "@/services/yahoo/symbol-resolver";
import { persistBacktestResult } from "./backtest-repository";

export async function executeBacktest(configuration: BacktestConfiguration) {
  const normalized = { ...configuration, symbol: normalizeSymbol(configuration.symbol), benchmark: normalizeSymbol(configuration.benchmark) };
  const [asset, benchmark] = await Promise.all([financialProviderRouter.analyticsChart(normalized.symbol, "MAX", "1d"), financialProviderRouter.analyticsChart(normalized.benchmark, "MAX", "1d").catch(() => null)]);
  const result = runBacktest({ configuration: normalized, bars: asset.data.points, benchmarkBars: benchmark?.data.points });
  const user = await getCurrentUser().catch(() => null); const runId = await persistBacktestResult(user?.id ?? null, result);
  return { result: { ...result, persisted: Boolean(runId) }, runId, providers: [...new Set([asset.meta.provider, benchmark?.meta.provider].flatMap((value) => value ? [value] : []))] };
}
