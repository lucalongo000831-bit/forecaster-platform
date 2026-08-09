import { buildComponent } from "./scoring";
import type { RiskMetric } from "./types";
export class MacroStressEngine { evaluate(metrics: RiskMetric[]) { return buildComponent("MACRO", "Macro", metrics, metrics.some((item) => (item.stressScore ?? 0) >= 65) ? "Macro indicators and scheduled events imply elevated uncertainty." : "Available macro observations do not indicate broad deterioration."); } }
