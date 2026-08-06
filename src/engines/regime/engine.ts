import { clamp } from "@/engines/shared/statistics";
import { MARKET_REGIME_MODEL_VERSION, type MarketRegimeAnalysis } from "./types";
import type { TechnicalAnalysis } from "@/engines/technical";

export function analyzeMarketRegime(benchmark: TechnicalAnalysis): MarketRegimeAnalysis {
  const longAverage = benchmark.trend.sma["200"].value;
  const aboveLongAverage = longAverage === null ? null : benchmark.price >= longAverage;
  const trendComposite = benchmark.trend.score * 0.55 + benchmark.structure.score * 0.25 + benchmark.momentum.score * 0.2;
  const direction = aboveLongAverage === true && trendComposite >= 56
    ? "BULL"
    : aboveLongAverage === false && trendComposite <= 44
      ? "BEAR"
      : "RANGE";
  const annualizedVolatility = benchmark.volatility.annualized20;
  const volatility = annualizedVolatility !== null && annualizedVolatility >= 25 ? "HIGH" : "LOW";
  const regime = `${direction}_${volatility}_VOL` as MarketRegimeAnalysis["regime"];
  const score = clamp(
    trendComposite + (direction === "BULL" ? 6 : direction === "BEAR" ? -6 : 0) - (volatility === "HIGH" ? 8 : 0),
    0,
    100,
  );
  const riskAppetite = direction === "BULL" && volatility === "LOW"
    ? "RISK_ON"
    : direction === "BEAR" || volatility === "HIGH"
      ? "RISK_OFF"
      : "NEUTRAL";
  const completeness = clamp(benchmark.completeness, 0, 100);
  const confidence = clamp(completeness * 0.7 + Math.abs(trendComposite - 50) * 1.2, 0, 100);
  const reasons = [
    longAverage === null ? "Media mobile a 200 periodi non disponibile." : `Benchmark ${aboveLongAverage ? "sopra" : "sotto"} la media a 200 periodi.`,
    annualizedVolatility === null ? "Volatilità annualizzata non disponibile." : `Volatilità realizzata annualizzata al ${annualizedVolatility.toFixed(1)}%.`,
    `Composito trend/struttura/momentum a ${trendComposite.toFixed(1)}/100.`,
  ];
  const invalidations = direction === "BULL"
    ? ["Chiusura persistente sotto la media a 200 periodi.", "Passaggio del composito di trend sotto 50."]
    : direction === "BEAR"
      ? ["Recupero persistente sopra la media a 200 periodi.", "Passaggio del composito di trend sopra 50."]
      : ["Breakout confermato dal range con trend e volume concordi."];

  return {
    benchmarkSymbol: benchmark.symbol,
    calculatedAt: new Date().toISOString(),
    dataTimestamp: benchmark.timestamp,
    modelVersion: MARKET_REGIME_MODEL_VERSION,
    regime,
    direction,
    volatility,
    riskAppetite,
    score,
    confidence,
    completeness,
    reasons,
    invalidations,
    input: benchmark,
  };
}
