import "server-only";

import { analyzeRiskPlan, type RiskProfile, type TradeSide } from "@/engines/risk";
import type { SignalHorizon } from "@/engines/signals";
import { normalizeSymbol } from "@/services/yahoo/symbol-resolver";
import { getTechnicalAnalysis } from "./technical-service";

export interface RiskServiceInput {
  symbol: string;
  side: TradeSide;
  entryPrice: number;
  horizon: SignalHorizon;
  riskProfile: RiskProfile;
  accountSize?: number | null;
  maximumRiskPercent?: number | null;
  customAtrMultiplier?: number | null;
  customStopPercent?: number | null;
}

export async function getRiskPlan(input: RiskServiceInput) {
  const symbol = normalizeSymbol(input.symbol);
  const technical = await getTechnicalAnalysis(symbol, input.horizon, "^GSPC");
  return { plan: analyzeRiskPlan({ ...input, symbol, technical: technical.analysis }), provider: technical.provider };
}
