import { buildComponent } from "./scoring";
import type { RiskMetric } from "./types";
export class CrossAssetStressEngine { evaluate(metrics: RiskMetric[]) { return buildComponent("CROSS_ASSET", "Cross-asset", metrics, metrics.some((item) => (item.stressScore ?? 0) >= 65) ? "Cross-asset co-movement is amplifying stress." : "Cross-asset transmission remains contained in available data."); } }
