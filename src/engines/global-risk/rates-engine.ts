import { buildComponent } from "./scoring";
import type { RiskMetric } from "./types";
export class RatesStressEngine { evaluate(metrics: RiskMetric[]) { return buildComponent("RATES", "Rates", metrics, metrics.some((item) => (item.stressScore ?? 0) >= 60) ? "Rates remain a meaningful source of market stress." : "Rates stress is contained according to available observations."); } }
