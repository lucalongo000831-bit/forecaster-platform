import { buildComponent } from "./scoring";
import type { RiskMetric } from "./types";
export class EquityStressEngine { evaluate(metrics: RiskMetric[]) { return buildComponent("EQUITY_STRESS", "Equity stress", metrics, metrics.some((item) => (item.stressScore ?? 0) >= 65) ? "Several equity markets show elevated stress." : "Equity stress remains contained across available markets."); } }
