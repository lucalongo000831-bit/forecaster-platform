import "server-only";

import { analyzeTechnical } from "@/engines/technical";
import type { SignalHorizon } from "@/engines/signals";
import { financialProviderRouter } from "@/providers";
import { normalizeSymbol } from "@/services/yahoo/symbol-resolver";

export async function getTechnicalAnalysis(symbolInput: string, horizon: SignalHorizon = "1m", benchmarkInput = "^GSPC") {
  const symbol = normalizeSymbol(decodeURIComponent(symbolInput));
  const benchmark = normalizeSymbol(benchmarkInput);
  const intraday = horizon === "intraday";
  const load = (requestedSymbol: string) => intraday
    ? financialProviderRouter.chart(requestedSymbol, "5D", "5m")
    : financialProviderRouter.analyticsChart(requestedSymbol, "5Y", "1d");
  const [chart, benchmarkChart] = await Promise.all([
    load(symbol),
    symbol === benchmark ? Promise.resolve(null) : load(benchmark).catch(() => null),
  ]);
  const analysis = analyzeTechnical(symbol, chart.data.points, benchmarkChart ? { symbol: benchmark, bars: benchmarkChart.data.points } : undefined);
  const benchmarkAnalysis = benchmarkChart ? analyzeTechnical(benchmark, benchmarkChart.data.points) : symbol === benchmark ? analysis : null;
  return { analysis, benchmarkAnalysis, provider: chart.meta.provider, benchmarkProvider: benchmarkChart?.meta.provider ?? null, sourceTimestamp: chart.meta.sourceTimestamp };
}
