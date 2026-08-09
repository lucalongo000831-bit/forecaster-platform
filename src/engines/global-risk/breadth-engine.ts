import { buildComponent } from "./scoring";
import type { RiskMetric } from "./types";
export class BreadthEngine { evaluate(metrics: RiskMetric[]) { return buildComponent("MARKET_BREADTH", "Market breadth", metrics, metrics.some((item) => (item.stressScore ?? 0) >= 60) ? "Participation is narrow across available breadth proxies." : "Market participation is stable across available proxies."); } }
