import type { PositionPlannerInput, PositionPlannerResult } from "@/types";

const finitePositive = (value: number | null): value is number => typeof value === "number" && Number.isFinite(value) && value > 0;

export function calculatePositionPlan(input: PositionPlannerInput): PositionPlannerResult {
  const base: PositionPlannerResult = { status: "INCOMPLETE", reason: "ENTRY_STOP_REQUIRED", side: input.side, entry: input.entry, stop: input.stop, risk: null, riskPercent: null, atrDistance: null, riskCapital: null, quantity: null, wholeQuantity: null, notional: null, targets: [], modelVersion: "position-planner-v1.0.0" };
  if (!finitePositive(input.entry) || !finitePositive(input.stop)) return base;
  const risk = input.side === "LONG" ? input.entry - input.stop : input.stop - input.entry;
  if (risk <= 0) return { ...base, status: "INVALID", reason: input.side === "LONG" ? "LONG_STOP_MUST_BE_BELOW_ENTRY" : "SHORT_STOP_MUST_BE_ABOVE_ENTRY" };
  const validTargets = input.targets.flatMap((price, index) => {
    if (!finitePositive(price)) return [];
    const reward = input.side === "LONG" ? price - input.entry! : input.entry! - price;
    if (reward <= 0) return [];
    return [{ index: index + 1, price, reward, rewardPercent: reward / input.entry! * 100, riskReward: reward / risk }];
  });
  const accountSize = finitePositive(input.accountSize) ? input.accountSize : null;
  const riskPercentInput = finitePositive(input.riskPercent) && input.riskPercent <= 100 ? input.riskPercent : null;
  const riskCapital = accountSize !== null && riskPercentInput !== null ? accountSize * riskPercentInput / 100 : null;
  const rawQuantity = riskCapital === null ? null : riskCapital / risk;
  const quantity = rawQuantity === null ? null : input.fractional ? rawQuantity : Math.floor(rawQuantity);
  return {
    ...base,
    status: "VALID",
    reason: validTargets.length ? null : "NO_VALID_TARGETS",
    risk,
    riskPercent: risk / input.entry * 100,
    atrDistance: finitePositive(input.atr) ? risk / input.atr : null,
    riskCapital,
    quantity,
    wholeQuantity: rawQuantity === null ? null : Math.floor(rawQuantity),
    notional: quantity === null ? null : quantity * input.entry,
    targets: validTargets,
  };
}
