import { buildComponent } from "./scoring";
import type { RiskMetric } from "./types";
export class CreditStressEngine { evaluate(metrics: RiskMetric[]) { return buildComponent("CREDIT", "Credit", metrics, metrics.some((item) => (item.stressScore ?? 0) >= 60) ? "Credit proxies show material deterioration." : "Available credit proxies remain broadly orderly."); } }
