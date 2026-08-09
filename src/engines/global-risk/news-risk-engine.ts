import { buildComponent } from "./scoring";
import type { RiskMetric } from "./types";
export class NewsRiskEngine { evaluate(metrics: RiskMetric[]) { return buildComponent("GEOPOLITICS", "News / geopolitics", metrics, metrics.some((item) => (item.stressScore ?? 0) >= 65) ? "Negative-news concentration is elevated." : "Rules-based news risk remains contained."); } }
