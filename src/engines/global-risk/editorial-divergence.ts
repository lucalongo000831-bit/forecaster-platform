import type { GlobalRiskStatus } from "./types";
export function hasEditorialDivergence(automatic: GlobalRiskStatus, editorial: string) { return editorial !== "UNAVAILABLE" && automatic !== editorial; }
