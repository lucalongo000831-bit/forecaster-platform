import { clamp, median } from "@/engines/shared/statistics";
import { RISK_MODEL_VERSION, type RiskPlan, type RiskPlanInput } from "./types";

const profiles = {
  CONSERVATIVE: { atr: 1.5, percentage: 0.03 }, MODERATE: { atr: 2, percentage: 0.05 }, AGGRESSIVE: { atr: 3, percentage: 0.08 }, CUSTOM: { atr: 2, percentage: 0.05 },
} as const;

export function analyzeRiskPlan(input: RiskPlanInput): RiskPlan {
  const settings = profiles[input.riskProfile];
  const multiplier = input.riskProfile === "CUSTOM" ? clamp(input.customAtrMultiplier ?? 2, 0.5, 6) : settings.atr;
  const stopPercent = input.riskProfile === "CUSTOM" ? clamp(input.customStopPercent ?? 0.05, 0.005, 0.25) : settings.percentage;
  const atr = input.technical.volatility.atr14.value;
  const structuralStop = input.side === "LONG" ? input.technical.structure.support20 : input.technical.structure.resistance20;
  const atrStop = atr === null ? null : input.side === "LONG" ? input.entryPrice - atr * multiplier : input.entryPrice + atr * multiplier;
  const percentageStop = input.side === "LONG" ? input.entryPrice * (1 - stopPercent) : input.entryPrice * (1 + stopPercent);
  const validStops = [structuralStop, atrStop, percentageStop].filter((value): value is number => value !== null && (input.side === "LONG" ? value < input.entryPrice : value > input.entryPrice));
  const suggestedStop = median(validStops);
  const riskPerShare = suggestedStop === null ? null : Math.abs(input.entryPrice - suggestedStop);
  const direction = input.side === "LONG" ? 1 : -1;
  const target1 = riskPerShare === null ? null : input.entryPrice + direction * riskPerShare;
  const target2 = riskPerShare === null ? null : input.entryPrice + direction * riskPerShare * 2;
  const target3 = riskPerShare === null ? null : input.entryPrice + direction * riskPerShare * 3;
  const rewardPerShare = target2 === null ? null : Math.abs(target2 - input.entryPrice);
  const riskRewardRatio = riskPerShare === null || riskPerShare === 0 || rewardPerShare === null ? null : rewardPerShare / riskPerShare;
  const maximumRiskPercent = input.maximumRiskPercent === null || input.maximumRiskPercent === undefined ? null : clamp(input.maximumRiskPercent, 0.1, 10);
  const riskBudget = input.accountSize && maximumRiskPercent ? input.accountSize * maximumRiskPercent / 100 : null;
  const positionSize = riskBudget !== null && riskPerShare && riskPerShare > 0 ? Math.floor(Math.min(riskBudget / riskPerShare, input.accountSize! / input.entryPrice)) : null;
  const atrPercent = atr === null ? null : atr / input.entryPrice * 100;
  return {
    symbol: input.symbol, side: input.side, entryPrice: input.entryPrice, horizon: input.horizon, riskProfile: input.riskProfile,
    suggestedStop, structuralStop, atrStop, percentageStop, trailingStopDistance: atr === null ? null : atr * multiplier,
    chandelierExit: atr === null ? null : input.side === "LONG" ? (input.technical.structure.swingHigh ?? input.entryPrice) - atr * 3 : (input.technical.structure.swingLow ?? input.entryPrice) + atr * 3,
    target1, target2, target3, riskPerShare, rewardPerShare, riskRewardRatio, positionSize,
    invalidationLevel: structuralStop ?? suggestedStop,
    volatilityWarning: atrPercent !== null && atrPercent > 4 ? `ATR elevato (${atrPercent.toFixed(1)}% del prezzo): dimensionamento e livelli richiedono cautela.` : null,
    assumptions: [`ATR multiplier ${multiplier.toFixed(1)}x.`, `Stop percentuale ${(stopPercent * 100).toFixed(1)}%.`, "Target espressi in multipli 1R, 2R e 3R."],
    modelVersion: RISK_MODEL_VERSION, calculatedAt: new Date().toISOString(),
    disclaimer: "Piano di rischio informativo: non invia ordini e non costituisce consulenza finanziaria. Verificare liquidità, gap risk, slippage e vincoli personali.",
  };
}
