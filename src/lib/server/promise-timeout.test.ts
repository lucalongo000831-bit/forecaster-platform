import { afterEach, describe, expect, it, vi } from "vitest";
import { withServerTimeout } from "./promise-timeout";

afterEach(() => {
  vi.useRealTimers();
});

describe("withServerTimeout", () => {
  it("returns a completed operation and clears its deadline", async () => {
    await expect(withServerTimeout(Promise.resolve("ready"), 5_000, "timed out")).resolves.toBe("ready");
  });

  it("terminates a hanging operation with a retryable timeout", async () => {
    vi.useFakeTimers();
    const result = withServerTimeout(new Promise<never>(() => undefined), 5_000, "Session lookup timed out");
    const assertion = expect(result).rejects.toMatchObject({
      code: "TIMEOUT",
      status: 504,
      retryable: true,
      message: "Session lookup timed out",
    });

    await vi.advanceTimersByTimeAsync(5_000);
    await assertion;
  });
});
