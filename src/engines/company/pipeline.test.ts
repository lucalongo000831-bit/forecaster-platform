import { describe, expect, it } from "vitest";
import { runCompanyStage } from "./pipeline";

describe("runCompanyStage", () => {
  it("preserves the original error for required-stage error mapping", async () => {
    const upstreamError = new Error("upstream failed");
    const result = await runCompanyStage("RequiredQuote", async () => {
      throw upstreamError;
    });

    expect(result.data).toBeNull();
    expect(result.error).toBe(upstreamError);
    expect(result.stage).toMatchObject({ status: "failed", message: "Stage unavailable; the remaining analysis continued." });
    expect(result.stage.message).not.toContain("upstream failed");
  });

  it("returns no error for a completed stage", async () => {
    const result = await runCompanyStage("Profile", async () => ({ symbol: "AAPL" }));
    expect(result.error).toBeNull();
    expect(result.data).toEqual({ symbol: "AAPL" });
  });
});
