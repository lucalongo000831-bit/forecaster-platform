import { buildComponent } from "./scoring";
import type { RiskMetric } from "./types";
export class LiquidityStressEngine { evaluate(metrics: RiskMetric[]) { return buildComponent("LIQUIDITY", "Liquidity", metrics, metrics.some((item) => (item.stressScore ?? 0) >= 65) ? "Available liquidity proxies show strain." : "No broad liquidity dysfunction is detected in available proxies."); } }
