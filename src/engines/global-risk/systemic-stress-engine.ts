import { GLOBAL_RISK_CONFIG } from "./config";
import type { GlobalRiskComponent, SystemicStress } from "./types";

export class SystemicStressEngine {
  evaluate(components: GlobalRiskComponent[]): SystemicStress {
    const available = components.filter((component) => component.score !== null);
    const critical = available.filter((component) => component.score! >= GLOBAL_RISK_CONFIG.componentCriticalScore);
    const elevated = available.filter((component) => component.score! >= GLOBAL_RISK_CONFIG.componentElevatedScore);
    const transmissionCritical = GLOBAL_RISK_CONFIG.systemic.requiredTransmissionComponents.some((key) => critical.some((component) => component.key === key));
    const independentMarkets = new Set(critical.map((component) => component.key)).size;

    if (independentMarkets >= GLOBAL_RISK_CONFIG.systemic.activeMinimumCritical && transmissionCritical) return "ACTIVE";
    if (independentMarkets >= GLOBAL_RISK_CONFIG.systemic.elevatedMinimumCritical && transmissionCritical) return "ELEVATED";
    if (elevated.length >= GLOBAL_RISK_CONFIG.systemic.watchMinimumElevated) return "WATCH";
    return "NONE";
  }
}
