import type { PositionPlannerInput, PositionPlannerResult } from "@/types";

const finitePositive = (value: number | null): value is number => typeof value === "number" && Number.isFinite(value) && value > 0;

export function calculatePositionPlan(input: PositionPlannerInput): PositionPlannerResult {
  const base: PositionPlannerResult = { status: "INCOMPLETE", reason: "ENTRY_STOP_REQUIRED", side: input.side, entry: input.entry, stop: input.stop, risk: null, riskPercent: null, atrDistance: null, riskCapital: null, quantity: null, wholeQuantity: null, notional: null, targets: [], modelVersion: "position-planner-v1.0.0" };
  if (!finitePositive(input.entry) || !finitePositive(input.stop)) {
    const suppliedInvalidPrice = (input.entry !== null && !finitePositive(input.entry)) || (input.stop !== null && !finitePositive(input.stop));
    return suppliedInvalidPrice ? { ...base, status: "INVALID", reason: "ENTRY_STOP_MUST_BE_POSITIVE" } : base;
  }
  const risk = input.side === "LONG" ? input.entry - input.stop : input.stop - input.entry;
  if (risk <= 0) return { ...base, status: "INVALID", reason: input.side === "LONG" ? "LONG_STOP_MUST_BE_BELOW_ENTRY" : "SHORT_STOP_MUST_BE_ABOVE_ENTRY" };
  const validTargets = input.targets.flatMap((price, index) => {
    if (!finitePositive(price)) return [];
    const reward = input.side === "LONG" ? price - input.entry! : input.entry! - price;
    if (reward <= 0) return [];
    return [{ index: index + 1, price, reward, rewardPercent: reward / input.entry! * 100, riskReward: reward / risk }];
  });
  if (input.accountSize !== null && !finitePositive(input.accountSize)) return { ...base, status: "INVALID", reason: "ACCOUNT_SIZE_MUST_BE_POSITIVE", risk, riskPercent: risk / input.entry * 100 };
  if (input.riskPercent !== null && (!finitePositive(input.riskPercent) || input.riskPercent > 100)) return { ...base, status: "INVALID", reason: "RISK_PERCENT_MUST_BE_BETWEEN_ZERO_AND_100", risk, riskPercent: risk / input.entry * 100 };
  const accountSize = input.accountSize;
  const riskPercentInput = input.riskPercent;
  const riskCapital = accountSize !== null && riskPercentInput !== null ? accountSize * riskPercentInput / 100 : null;
  const rawQuantity = riskCapital === null ? null : riskCapital / risk;
  const quantity = rawQuantity === null ? null : input.fractional ? rawQuantity : Math.floor(rawQuantity);
  const notional = quantity === null ? null : quantity * input.entry;
  if ([risk, riskCapital, rawQuantity, quantity, notional].some((value) => value !== null && !Number.isFinite(value))) return { ...base, status: "INVALID", reason: "NUMERIC_OVERFLOW" };
  return {
    ...base,
    status: validTargets.length ? "VALID" : "INCOMPLETE",
    reason: validTargets.length ? null : "NO_VALID_TARGETS",
    risk,
    riskPercent: risk / input.entry * 100,
    atrDistance: finitePositive(input.atr) ? risk / input.atr : null,
    riskCapital,
    quantity,
    wholeQuantity: rawQuantity === null ? null : Math.floor(rawQuantity),
    notional,
    targets: validTargets,
  };
}
