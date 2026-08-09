import { buildComponent } from "./scoring";
import type { RiskMetric } from "./types";
export class VolatilityStressEngine { evaluate(metrics: RiskMetric[]) { const usable = metrics.filter((item) => item.stressScore !== null); const elevated = usable.filter((item) => (item.stressScore ?? 0) >= 55).length; return buildComponent("VOLATILITY", "Volatility", metrics, usable.length ? `${elevated} of ${usable.length} available volatility signals are elevated.` : "Volatility inputs are unavailable."); } }
