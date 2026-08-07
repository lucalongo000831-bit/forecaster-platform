import "server-only";

import { enforceRateLimit } from "@/lib/server/rate-limit";

export const COMPANY_ANALYSIS_RATE_POLICY = {
  scope: "company:analysis",
  limit: 12,
  windowSeconds: 60,
} as const;

/** One shared budget for every public view of the same expensive report pipeline. */
export async function enforceCompanyAnalysisRateLimit(identifier: string) {
  await enforceRateLimit(identifier, COMPANY_ANALYSIS_RATE_POLICY);
}
