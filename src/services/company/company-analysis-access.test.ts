import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ enforceRateLimit: vi.fn() }));
vi.mock("@/lib/server/rate-limit", () => ({ enforceRateLimit: mocks.enforceRateLimit }));

import { COMPANY_ANALYSIS_RATE_POLICY, enforceCompanyAnalysisRateLimit } from "./company-analysis-access";

describe("company analysis access budget", () => {
  beforeEach(() => mocks.enforceRateLimit.mockReset());

  it("uses one aggregate scope for every company analysis entrypoint", async () => {
    await enforceCompanyAnalysisRateLimit("203.0.113.7");
    await enforceCompanyAnalysisRateLimit("203.0.113.7");

    expect(COMPANY_ANALYSIS_RATE_POLICY).toEqual({ scope: "company:analysis", limit: 12, windowSeconds: 60 });
    expect(mocks.enforceRateLimit).toHaveBeenNthCalledWith(1, "203.0.113.7", COMPANY_ANALYSIS_RATE_POLICY);
    expect(mocks.enforceRateLimit).toHaveBeenNthCalledWith(2, "203.0.113.7", COMPANY_ANALYSIS_RATE_POLICY);
  });
});
